import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRsoDirectory } from "../rsoDirectory.js";
import { createFakeCollection } from "./fakeCollection.js";

const GUILD = "guild-1";
const OFFICER_ROLE = "officer-role";
const MOD_ROLE = "mod-role";
const IUGA_OFFICER_ROLE = "iuga-officer-role";
const MANAGE_MESSAGES = String(1n << 13n);

function discordError(code) {
  return Object.assign(new Error(`Discord failed, code ${code}`), { discordCode: code });
}

function createGuild({ roles = [], members = ["u1", "u2"] } = {}) {
  let sequence = 0;
  const guild = {
    roles: [...roles],
    members: new Map(members.map((id) => [id, new Set()])),
    fail: {},
    async listRoles() {
      if (guild.fail.listRoles) throw guild.fail.listRoles;
      return guild.roles.map((role) => ({ ...role }));
    },
    async createRole(_guildId, { name }) {
      if (guild.fail.createRole) throw guild.fail.createRole;
      const role = { id: `role-${++sequence}`, name, permissions: "0" };
      guild.roles.push(role);
      return { ...role };
    },
    async addMemberRole(_guildId, userId, roleId) {
      if (!guild.members.has(userId)) throw discordError(10007);
      if (roleId !== OFFICER_ROLE && !guild.roles.some((role) => role.id === roleId)) throw discordError(10011);
      guild.members.get(userId).add(roleId);
      return null;
    },
    async deleteRole(_guildId, roleId) {
      guild.roles = guild.roles.filter((role) => role.id !== roleId);
      return null;
    },
  };
  return guild;
}

function setup(guildOptions) {
  const models = { DiscordRsos: createFakeCollection({ uniqueKeys: [["rsoKey"]] }) };
  const guild = createGuild(guildOptions);
  let clock = 0;
  const directory = createRsoDirectory({
    models,
    client: guild,
    officerRoleId: OFFICER_ROLE,
    staffRoleIds: [MOD_ROLE, IUGA_OFFICER_ROLE],
    iugaOfficerRoleId: IUGA_OFFICER_ROLE,
    now: () => clock,
  });
  return { models, guild, directory, advance: (ms) => (clock += ms) };
}

const officerRole = (guild, rsoName) => guild.roles.find((role) => role.name === `${rsoName} Officer`);

function grant(directory, overrides = {}) {
  return directory.grantOfficer({
    guildId: GUILD,
    userId: "u1",
    rsoKey: "hci club",
    rsoName: "HCI Club",
    grantedBy: "mod-1",
    ...overrides,
  });
}

describe("rsoDirectory.identify", () => {
  it("gives the same key for different case and spacing, and keeps the stored name", async () => {
    const { directory } = setup();
    const first = await directory.identify("  HCI   Club ", GUILD);
    await grant(directory, { rsoKey: first.rsoKey, rsoName: first.name });

    const second = await directory.identify("hci club", GUILD);

    assert.equal(second.rsoKey, first.rsoKey);
    assert.equal(second.name, "HCI Club");
    assert.equal(second.isNew, false);
  });

  it("marks an unknown RSO as new without writing anything", async () => {
    const { directory, models } = setup();

    const identity = await directory.identify("Data Science Club", GUILD);

    assert.equal(identity.isNew, true);
    assert.equal(identity.name, "Data Science Club");
    assert.equal(models.DiscordRsos.docs.length, 0);
  });

  it("rejects names that are empty or longer than 80 characters", async () => {
    const { directory } = setup();

    assert.equal(await directory.identify("   ", GUILD), null);
    assert.equal(await directory.identify("x".repeat(81), GUILD), null);
  });

  it("treats an existing RSO membership role as a known RSO and uses its spelling", async () => {
    const { directory } = setup({ roles: [{ id: "binfo", name: "BINFO", permissions: "0" }] });

    assert.deepEqual(await directory.identify("binfo", GUILD), { rsoKey: "binfo", name: "BINFO", isNew: false });
  });
});

describe("rsoDirectory.suggest", () => {
  it("returns up to 25 known RSO names that match the typed text", async () => {
    const { directory, models } = setup();
    for (let index = 0; index < 30; index += 1) {
      await models.DiscordRsos.create({ name: `Club ${index}`, rsoKey: `club ${index}`, createdByDiscordId: "m" });
    }
    await models.DiscordRsos.create({ name: "HCI Club", rsoKey: "hci club", createdByDiscordId: "m" });

    assert.equal((await directory.suggest("club", GUILD)).length, 25);
    assert.deepEqual(await directory.suggest("HCI", GUILD), ["HCI Club"]);
  });

  it("returns an empty list when nothing matches, and treats regex characters literally", async () => {
    const { directory } = setup();

    assert.deepEqual(await directory.suggest("anything", GUILD), []);
    assert.deepEqual(await directory.suggest(".*", GUILD), []);
  });

  it("suggests RSO membership roles but not staff, managed, officer, or @everyone roles", async () => {
    const { directory } = setup({
      roles: [
        { id: GUILD, name: "@everyone", permissions: "0" },
        { id: "binfo", name: "BINFO", permissions: "104324673" },
        { id: "winfo", name: "WINFO", permissions: "0" },
        { id: MOD_ROLE, name: "Wise Owls", permissions: "0" },
        { id: OFFICER_ROLE, name: "RSO Officer", permissions: "0" },
        { id: "helpers", name: "Helpers", permissions: MANAGE_MESSAGES },
        { id: "bot", name: "IUGA Events", permissions: "0", managed: true },
        { id: "bo", name: "BINFO Officer", permissions: "0" },
      ],
    });

    assert.deepEqual(await directory.suggest("", GUILD), ["BINFO", "WINFO"]);
  });

  it("reads server roles at most once a minute while someone types", async () => {
    const { directory, guild, advance } = setup({ roles: [{ id: "binfo", name: "BINFO", permissions: "0" }] });
    let reads = 0;
    const listRoles = guild.listRoles;
    guild.listRoles = async (...args) => {
      reads += 1;
      return listRoles(...args);
    };

    await directory.suggest("b", GUILD);
    await directory.suggest("bi", GUILD);
    advance(60_001);
    await directory.suggest("bin", GUILD);

    assert.equal(reads, 2);
  });
});

describe("rsoDirectory.grantOfficer", () => {
  it("creates the RSO and a no-permission role, then grants it and the officer role", async () => {
    const { directory, guild } = setup();

    const result = await grant(directory);

    assert.equal(result.ok, true);
    assert.equal(result.created, true);
    assert.deepEqual(result.rso, { rsoKey: "hci club", rsoName: "HCI Club" });
    const role = officerRole(guild, "HCI Club");
    assert.equal(role.permissions, "0");
    assert.deepEqual([...guild.members.get("u1")].sort(), [OFFICER_ROLE, role.id].sort());
  });

  it("reuses the existing RSO role for a second officer", async () => {
    const { directory, guild } = setup();
    await grant(directory);

    const result = await grant(directory, { userId: "u2" });

    assert.equal(result.created, false);
    assert.equal(guild.roles.filter((role) => role.name === "HCI Club Officer").length, 1);
    assert.ok(guild.members.get("u2").has(officerRole(guild, "HCI Club").id));
  });

  it("refuses a new RSO named like a staff role", async () => {
    const { directory, guild, models } = setup({ roles: [{ id: MOD_ROLE, name: "Moderator", permissions: "0" }] });

    const result = await grant(directory, { rsoKey: "moderator", rsoName: "moderator" });

    assert.deepEqual(result, { ok: false, reason: "name-taken" });
    assert.equal(guild.roles.length, 1);
    assert.equal(models.DiscordRsos.docs.length, 0);
  });

  it("refuses a new RSO whose officer role already exists without the bot", async () => {
    const { directory } = setup({ roles: [{ id: "bo", name: "BINFO Officer", permissions: "0" }] });

    assert.deepEqual(await grant(directory, { rsoKey: "binfo", rsoName: "BINFO" }), { ok: false, reason: "name-taken" });
  });

  it("gives an officer role next to an RSO membership role without touching it", async () => {
    const { directory, guild } = setup({ roles: [{ id: "binfo", name: "BINFO", permissions: "0" }] });

    const result = await grant(directory, { rsoKey: "binfo", rsoName: "BINFO" });

    assert.equal(result.ok, true);
    const role = officerRole(guild, "BINFO");
    assert.ok(guild.members.get("u1").has(role.id));
    assert.equal(guild.members.get("u1").has("binfo"), false);
    assert.deepEqual(guild.roles.find((candidate) => candidate.id === "binfo"), { id: "binfo", name: "BINFO", permissions: "0" });
  });

  it("recreates a role that was deleted by hand", async () => {
    const { directory, guild } = setup();
    await grant(directory);
    guild.roles = [];

    const result = await grant(directory, { userId: "u2" });

    assert.equal(result.ok, true);
    assert.equal(guild.roles.length, 1);
    assert.ok(guild.members.get("u2").has(guild.roles[0].id));
  });

  it("reports a requester who left the server", async () => {
    const { directory } = setup({ members: [] });

    assert.deepEqual(await grant(directory), { ok: false, reason: "member-gone" });
  });

  it("reports when the bot cannot manage roles", async () => {
    const { directory, guild } = setup();
    guild.fail.createRole = discordError(50013);

    assert.deepEqual(await grant(directory), { ok: false, reason: "bot-cannot-manage-roles" });
  });

  it("lets other Discord failures through to the caller", async () => {
    const { directory, guild } = setup();
    guild.fail.listRoles = discordError(0);

    await assert.rejects(grant(directory), /Discord failed/);
  });

  it("leaves exactly one role when two approvals for a new RSO race", async () => {
    const { directory, guild } = setup();

    const [first, second] = await Promise.all([grant(directory), grant(directory, { userId: "u2" })]);

    assert.equal(first.ok && second.ok, true);
    assert.equal(guild.roles.length, 1);
    const roleId = officerRole(guild, "HCI Club").id;
    assert.ok(guild.members.get("u1").has(roleId));
    assert.ok(guild.members.get("u2").has(roleId));
  });
});

describe("rsoDirectory.rsosOf", () => {
  it("returns the RSOs whose roles the member holds", async () => {
    const { directory, guild } = setup();
    await grant(directory);
    const roleId = officerRole(guild, "HCI Club").id;

    assert.deepEqual(await directory.rsosOf({ roles: [roleId, "other"] }), [{ rsoKey: "hci club", rsoName: "HCI Club" }]);
  });

  it("returns an empty list for a member with no RSO roles", async () => {
    const { directory } = setup();

    assert.deepEqual(await directory.rsosOf({ roles: ["other"] }), []);
    assert.deepEqual(await directory.rsosOf({}), []);
  });

  it("counts an IUGA officer as representing IUGA without any RSO verification", async () => {
    const { directory } = setup();

    assert.deepEqual(await directory.rsosOf({ roles: [IUGA_OFFICER_ROLE] }), [{ rsoKey: "iuga", rsoName: "IUGA" }]);
  });

  it("lists IUGA alongside the RSOs an IUGA officer also leads", async () => {
    const { directory, guild } = setup();
    await grant(directory);
    const roleId = officerRole(guild, "HCI Club").id;

    assert.deepEqual(await directory.rsosOf({ roles: [roleId, IUGA_OFFICER_ROLE] }), [
      { rsoKey: "iuga", rsoName: "IUGA" },
      { rsoKey: "hci club", rsoName: "HCI Club" },
    ]);
  });

  it("lists IUGA once when an IUGA RSO record also matches the member", async () => {
    const { directory, guild } = setup();
    await grant(directory, { rsoKey: "iuga", rsoName: "IUGA" });
    const roleId = officerRole(guild, "IUGA").id;

    assert.deepEqual(await directory.rsosOf({ roles: [roleId, IUGA_OFFICER_ROLE] }), [{ rsoKey: "iuga", rsoName: "IUGA" }]);
  });
});
