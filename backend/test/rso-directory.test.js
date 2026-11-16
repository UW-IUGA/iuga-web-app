import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createRsoDirectory } from "../rsoDirectory.js";
import { createFakeCollection } from "./fakeCollection.js";

const GUILD = "guild-1";
const OFFICER_ROLE = "officer-role";

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
  const directory = createRsoDirectory({ models, client: guild, officerRoleId: OFFICER_ROLE });
  return { models, guild, directory };
}

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
    const first = await directory.identify("  HCI   Club ");
    await grant(directory, { rsoKey: first.rsoKey, rsoName: first.name });

    const second = await directory.identify("hci club");

    assert.equal(second.rsoKey, first.rsoKey);
    assert.equal(second.name, "HCI Club");
    assert.equal(second.isNew, false);
  });

  it("marks an unknown RSO as new without writing anything", async () => {
    const { directory, models } = setup();

    const identity = await directory.identify("Data Science Club");

    assert.equal(identity.isNew, true);
    assert.equal(identity.name, "Data Science Club");
    assert.equal(models.DiscordRsos.docs.length, 0);
  });

  it("rejects names that are empty or longer than 80 characters", async () => {
    const { directory } = setup();

    assert.equal(await directory.identify("   "), null);
    assert.equal(await directory.identify("x".repeat(81)), null);
  });
});

describe("rsoDirectory.suggest", () => {
  it("returns up to 25 known RSO names that match the typed text", async () => {
    const { directory, models } = setup();
    for (let index = 0; index < 30; index += 1) {
      await models.DiscordRsos.create({ name: `Club ${index}`, rsoKey: `club ${index}`, createdByDiscordId: "m" });
    }
    await models.DiscordRsos.create({ name: "HCI Club", rsoKey: "hci club", createdByDiscordId: "m" });

    assert.equal((await directory.suggest("club")).length, 25);
    assert.deepEqual(await directory.suggest("HCI"), ["HCI Club"]);
  });

  it("returns an empty list when nothing matches, and treats regex characters literally", async () => {
    const { directory } = setup();

    assert.deepEqual(await directory.suggest("anything"), []);
    assert.deepEqual(await directory.suggest(".*"), []);
  });
});

describe("rsoDirectory.grantOfficer", () => {
  it("creates the RSO and a no-permission role, then grants it and the officer role", async () => {
    const { directory, guild } = setup();

    const result = await grant(directory);

    assert.equal(result.ok, true);
    assert.equal(result.created, true);
    assert.deepEqual(result.rso, { rsoKey: "hci club", rsoName: "HCI Club" });
    const role = guild.roles.find((candidate) => candidate.name === "HCI Club");
    assert.equal(role.permissions, "0");
    assert.deepEqual([...guild.members.get("u1")].sort(), [OFFICER_ROLE, role.id].sort());
  });

  it("reuses the existing RSO role for a second officer", async () => {
    const { directory, guild } = setup();
    await grant(directory);

    const result = await grant(directory, { userId: "u2" });

    assert.equal(result.created, false);
    assert.equal(guild.roles.filter((role) => role.name === "HCI Club").length, 1);
    assert.ok(guild.members.get("u2").has(guild.roles[0].id));
  });

  it("refuses a new RSO named like an existing server role", async () => {
    const { directory, guild, models } = setup({ roles: [{ id: "mods", name: "Moderator" }] });

    const result = await grant(directory, { rsoKey: "moderator", rsoName: "moderator" });

    assert.deepEqual(result, { ok: false, reason: "name-taken" });
    assert.equal(guild.roles.length, 1);
    assert.equal(models.DiscordRsos.docs.length, 0);
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
    const roleId = guild.roles[0].id;
    assert.ok(guild.members.get("u1").has(roleId));
    assert.ok(guild.members.get("u2").has(roleId));
  });
});

describe("rsoDirectory.rsosOf", () => {
  it("returns the RSOs whose roles the member holds", async () => {
    const { directory, guild } = setup();
    await grant(directory);
    const roleId = guild.roles[0].id;

    assert.deepEqual(await directory.rsosOf({ roles: [roleId, "other"] }), [{ rsoKey: "hci club", rsoName: "HCI Club" }]);
  });

  it("returns an empty list for a member with no RSO roles", async () => {
    const { directory } = setup();

    assert.deepEqual(await directory.rsosOf({ roles: ["other"] }), []);
    assert.deepEqual(await directory.rsosOf({}), []);
  });
});
