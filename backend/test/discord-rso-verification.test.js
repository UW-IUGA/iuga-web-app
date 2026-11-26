import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RSO_VERIFY_COMMAND } from "../discord/commandDefinition.js";
import { createDiscordDispatcher } from "../discord/dispatcher.js";
import { createDiscordApprovals } from "../discord/events/approvals.js";
import { createRsoVerification } from "../discord/rsos/verification.js";
import { createServerRoles } from "../discord/roles.js";
import { createFakeCollection } from "./fakeCollection.js";

const NOW = new Date("2026-11-16T20:00:00Z");
const GUILD = "guild-1";
const RSO_CHANNEL = "rso-approvals";
const MOD_ROLE = "mod-role";
const IUGA_OFFICER_ROLE = "iuga-officer-role";
const ADMINISTRATOR = String(1n << 3n);

const REQUESTER_ID = "1001";
const MOD_ID = "2001";
const OTHER_ID = "4001";

const EPHEMERAL = 64;
const CHANNEL_MESSAGE = 4;
const UPDATE_MESSAGE = 7;
const AUTOCOMPLETE_RESULT = 8;
const MODAL = 9;

function createClient() {
  const calls = [];
  let sequence = 500;
  const client = {
    calls,
    failPost: false,
    failDm: false,
    async postMessage(channelId, body) {
      calls.push({ method: "postMessage", channelId, body });
      if (client.failPost) throw new Error("Discord POST failed with status 403");
      return { id: String(++sequence) };
    },
    async sendDirectMessage(userId, body) {
      calls.push({ method: "sendDirectMessage", userId, body });
      if (client.failDm) throw new Error("Discord DM failed, code 50007");
      return { id: "dm" };
    },
  };
  return client;
}

function createDirectory() {
  const known = new Map([["hci club", "HCI Club"]]);
  const directory = {
    grants: [],
    grantResult: null,
    grantError: null,
    guilds: [],
    async suggest(text, guildId) {
      directory.guilds.push(guildId);
      return [...known.values()].filter((name) => name.toLowerCase().includes(String(text).toLowerCase()));
    },
    async identify(typed, guildId) {
      directory.guilds.push(guildId);
      const name = String(typed).trim().replace(/\s+/g, " ");
      if (!name || name.length > 80) return null;
      const rsoKey = name.toLowerCase();
      return { rsoKey, name: known.get(rsoKey) ?? name, isNew: !known.has(rsoKey) };
    },
    async rsosOf() {
      return [];
    },
    async grantOfficer(input) {
      directory.grants.push(input);
      if (directory.grantError) throw directory.grantError;
      if (directory.grantResult) return directory.grantResult;
      const created = !known.has(input.rsoKey);
      known.set(input.rsoKey, input.rsoName);
      return { ok: true, rso: { rsoKey: input.rsoKey, rsoName: input.rsoName }, created };
    },
  };
  return directory;
}

function setup() {
  const models = { DiscordRsoRequests: createFakeCollection({ uniqueKeys: [["openKey"]] }) };
  const client = createClient();
  const directory = createDirectory();
  let now = NOW;
  const flow = createRsoVerification({
    models,
    directory,
    client,
    roles: createServerRoles({ modRoleId: MOD_ROLE, iugaOfficerRoleId: IUGA_OFFICER_ROLE }),
    config: { rsoApprovalChannelId: RSO_CHANNEL },
    now: () => now,
  });
  return { models, client, directory, flow, advance: (ms) => (now = new Date(now.getTime() + ms)) };
}

function member(id, roles = [], extra = {}) {
  return { user: { id, username: `user${id}`, global_name: null }, nick: null, roles, ...extra };
}

const requester = () => member(REQUESTER_ID);
const moderator = () => member(MOD_ID, [MOD_ROLE]);

function verifyCommand(who, { rso = "HCI Club", position = "President" } = {}) {
  return {
    type: 2,
    guild_id: GUILD,
    member: who,
    data: {
      name: "rso-verify",
      options: [
        { name: "rso", type: 3, value: rso },
        { name: "position", type: 3, value: position },
      ],
    },
  };
}

function click(who, customId) {
  return { type: 3, guild_id: GUILD, member: who, message: { id: "card" }, data: { custom_id: customId, component_type: 2 } };
}

function denySubmit(who, id, reason) {
  return {
    type: 5,
    guild_id: GUILD,
    member: who,
    data: {
      custom_id: `rso-deny-reason:${id}`,
      components: [{ type: 1, components: [{ type: 4, custom_id: "reason", value: reason }] }],
    },
  };
}

async function submitted(context, options) {
  await context.flow.handle(verifyCommand(requester(), options));
  return context.models.DiscordRsoRequests.docs.at(-1);
}

function cardText(response) {
  const embed = response.data.embeds[0];
  return JSON.stringify(embed);
}

describe("/rso-verify command definition", () => {
  it("asks for an RSO with autocomplete and a position, both required", () => {
    const byName = Object.fromEntries(RSO_VERIFY_COMMAND.options.map((option) => [option.name, option]));
    assert.equal(RSO_VERIFY_COMMAND.name, "rso-verify");
    assert.equal(byName.rso.autocomplete, true);
    assert.equal(byName.rso.required, true);
    assert.equal(byName.position.required, true);
  });
});

describe("/rso-verify request", () => {
  it("stores the directory's key and posts a card with requester, RSO, and position", async () => {
    const context = setup();

    const response = await context.flow.handle(verifyCommand(requester(), { rso: "hci   club" }));

    const row = context.models.DiscordRsoRequests.docs[0];
    assert.equal(row.rsoKey, "hci club");
    assert.equal(row.rsoName, "HCI Club");
    assert.equal(row.status, "pending");
    assert.equal(response.data.flags, EPHEMERAL);
    const post = context.client.calls.find((call) => call.method === "postMessage");
    assert.equal(post.channelId, RSO_CHANNEL);
    const card = JSON.stringify(post.body.embeds[0]);
    assert.match(card, /HCI Club/);
    assert.match(card, /President/);
    assert.doesNotMatch(card, /New RSO/);
    const buttons = post.body.components[0].components.map((button) => button.custom_id);
    assert.deepEqual(buttons, [`rso-approve:${row._id}`, `rso-deny:${row._id}`]);
  });

  it("marks an RSO the directory does not know as New RSO", async () => {
    const context = setup();

    await context.flow.handle(verifyCommand(requester(), { rso: "Data Science Club" }));

    const post = context.client.calls.find((call) => call.method === "postMessage");
    assert.match(JSON.stringify(post.body.embeds[0]), /New RSO/);
  });

  it("rejects an invalid RSO name or position and writes nothing", async () => {
    const context = setup();

    const badName = await context.flow.handle(verifyCommand(requester(), { rso: "   " }));
    const badPosition = await context.flow.handle(verifyCommand(requester(), { position: "x".repeat(61) }));

    assert.match(badName.data.content, /RSO name/);
    assert.match(badPosition.data.content, /Position/);
    assert.equal(context.models.DiscordRsoRequests.docs.length, 0);
  });

  it("refuses a second open request from the same member for the same RSO", async () => {
    const context = setup();
    await submitted(context);

    const response = await context.flow.handle(verifyCommand(requester(), { rso: "hci club" }));

    assert.match(response.data.content, /already waiting/);
    assert.equal(context.models.DiscordRsoRequests.docs.length, 1);
  });

  it("deletes the request when the card cannot be posted", async () => {
    const context = setup();
    context.client.failPost = true;

    const response = await context.flow.handle(verifyCommand(requester()));

    assert.match(response.data.content, /not sent/);
    assert.equal(context.models.DiscordRsoRequests.docs.length, 0);
  });
});

describe("/rso-verify autocomplete", () => {
  it("answers with the directory's suggestions", async () => {
    const context = setup();

    const response = await context.flow.handle({
      type: 4,
      guild_id: GUILD,
      member: requester(),
      data: { name: "rso-verify", options: [{ name: "rso", type: 3, value: "hci", focused: true }] },
    });

    assert.equal(response.type, AUTOCOMPLETE_RESULT);
    assert.deepEqual(context.directory.guilds, [GUILD]);
    assert.deepEqual(response.data.choices, [{ name: "HCI Club", value: "HCI Club" }]);
  });
});

describe("RSO verification review", () => {
  it("refuses approve, deny, and deny submit from a non-reviewer and changes nothing", async () => {
    const context = setup();
    const row = await submitted(context);

    for (const interaction of [
      click(member(OTHER_ID), `rso-approve:${row._id}`),
      click(member(OTHER_ID), `rso-deny:${row._id}`),
      denySubmit(member(OTHER_ID), row._id, "no"),
    ]) {
      const response = await context.flow.handle(interaction);
      assert.equal(response.data.flags, EPHEMERAL);
      assert.match(response.data.content, /Only moderators/);
    }
    assert.equal(context.models.DiscordRsoRequests.docs[0].status, "pending");
    assert.equal(context.directory.grants.length, 0);
  });

  it("refuses self-approval", async () => {
    const context = setup();
    const row = await submitted(context);

    const response = await context.flow.handle(click(member(REQUESTER_ID, [MOD_ROLE]), `rso-approve:${row._id}`));

    assert.match(response.data.content, /your own request/);
    assert.equal(context.directory.grants.length, 0);
  });

  it("approves: grants through the directory, records reviewer and time, and tells the requester", async () => {
    const context = setup();
    const row = await submitted(context);

    const response = await context.flow.handle(click(moderator(), `rso-approve:${row._id}`));

    assert.deepEqual(context.directory.grants[0], {
      guildId: GUILD,
      userId: REQUESTER_ID,
      rsoKey: "hci club",
      rsoName: "HCI Club",
      grantedBy: MOD_ID,
    });
    const saved = context.models.DiscordRsoRequests.docs[0];
    assert.equal(saved.status, "approved");
    assert.equal(saved.reviewerDiscordId, MOD_ID);
    assert.equal(new Date(saved.reviewedAt).getTime(), NOW.getTime());
    assert.equal(response.type, UPDATE_MESSAGE);
    assert.deepEqual(response.data.components, []);
    assert.match(cardText(response), /Approved by user2001/);
    assert.doesNotMatch(cardText(response), /Created/);
    const dm = context.client.calls.find((call) => call.method === "sendDirectMessage");
    assert.equal(dm.userId, REQUESTER_ID);
    assert.match(dm.body.content, /verified/);
  });

  it("says the RSO was created only when the directory created it", async () => {
    const context = setup();
    const row = await submitted(context, { rso: "Data Science Club" });

    const response = await context.flow.handle(click(moderator(), `rso-approve:${row._id}`));

    assert.match(cardText(response), /Created the Data Science Club role/);
  });

  it("lets an IUGA officer or a server admin approve", async () => {
    for (const reviewer of [member(MOD_ID, [IUGA_OFFICER_ROLE]), member(MOD_ID, [], { permissions: ADMINISTRATOR })]) {
      const context = setup();
      const row = await submitted(context);

      const response = await context.flow.handle(click(reviewer, `rso-approve:${row._id}`));

      assert.equal(response.type, UPDATE_MESSAGE);
    }
  });

  it("returns the request to pending with a plain explanation for name-taken", async () => {
    const context = setup();
    const row = await submitted(context);
    context.directory.grantResult = { ok: false, reason: "name-taken" };

    const response = await context.flow.handle(click(moderator(), `rso-approve:${row._id}`));

    assert.equal(response.type, CHANNEL_MESSAGE);
    assert.match(response.data.content, /can't be approved as a new RSO/);
    assert.equal(context.models.DiscordRsoRequests.docs[0].status, "pending");
  });

  it("returns the request to pending and explains the fix when the bot cannot manage roles", async () => {
    const context = setup();
    const row = await submitted(context);
    context.directory.grantResult = { ok: false, reason: "bot-cannot-manage-roles" };

    const response = await context.flow.handle(click(moderator(), `rso-approve:${row._id}`));

    assert.match(response.data.content, /Manage Roles/);
    assert.equal(context.models.DiscordRsoRequests.docs[0].status, "pending");
  });

  it("closes the request automatically when the requester left the server", async () => {
    const context = setup();
    const row = await submitted(context);
    context.directory.grantResult = { ok: false, reason: "member-gone" };

    const response = await context.flow.handle(click(moderator(), `rso-approve:${row._id}`));

    const saved = context.models.DiscordRsoRequests.docs[0];
    assert.equal(saved.status, "denied");
    assert.equal(saved.denyReason, "Left the server");
    assert.equal(response.type, UPDATE_MESSAGE);
  });

  it("returns the request to pending and rethrows an unexpected Discord failure", async () => {
    const context = setup();
    const row = await submitted(context);
    context.directory.grantError = new Error("Discord down");

    await assert.rejects(context.flow.handle(click(moderator(), `rso-approve:${row._id}`)), /Discord down/);
    assert.equal(context.models.DiscordRsoRequests.docs[0].status, "pending");
  });

  it("does nothing on a second approve or a deny after approval", async () => {
    const context = setup();
    const row = await submitted(context);
    await context.flow.handle(click(moderator(), `rso-approve:${row._id}`));

    const again = await context.flow.handle(click(moderator(), `rso-approve:${row._id}`));
    const deny = await context.flow.handle(click(moderator(), `rso-deny:${row._id}`));

    assert.match(again.data.content, /already been reviewed/);
    assert.match(deny.data.content, /already been reviewed/);
    assert.equal(context.directory.grants.length, 1);
  });

  it("refuses a deny while an approval is in progress, and reopens a stale approval after 2 minutes", async () => {
    const context = setup();
    const row = await submitted(context);
    await context.models.DiscordRsoRequests.updateOne(
      { _id: row._id },
      { $set: { status: "approving", claimedAt: NOW, reviewerDiscordId: "someone" } },
    );

    const during = await context.flow.handle(denySubmit(moderator(), row._id, "Not an officer"));
    assert.match(during.data.content, /already been reviewed/);

    context.advance(2 * 60_000 + 1);
    const after = await context.flow.handle(denySubmit(moderator(), row._id, "Not an officer"));
    assert.equal(after.type, UPDATE_MESSAGE);
    assert.equal(context.models.DiscordRsoRequests.docs[0].status, "denied");
  });

  it("opens a deny form whose reason is required", async () => {
    const context = setup();
    const row = await submitted(context);

    const response = await context.flow.handle(click(moderator(), `rso-deny:${row._id}`));

    assert.equal(response.type, MODAL);
    assert.equal(response.data.custom_id, `rso-deny-reason:${row._id}`);
    assert.equal(response.data.components[0].components[0].required, true);
  });

  it("denies with a reason, records reviewer and time, and tells the requester why", async () => {
    const context = setup();
    const row = await submitted(context);

    const response = await context.flow.handle(denySubmit(moderator(), row._id, "We couldn't confirm your role"));

    const saved = context.models.DiscordRsoRequests.docs[0];
    assert.equal(saved.status, "denied");
    assert.equal(saved.denyReason, "We couldn't confirm your role");
    assert.equal(saved.reviewerDiscordId, MOD_ID);
    assert.equal(new Date(saved.reviewedAt).getTime(), NOW.getTime());
    assert.match(cardText(response), /Denied by user2001/);
    const dm = context.client.calls.find((call) => call.method === "sendDirectMessage");
    assert.match(dm.body.content, /We couldn't confirm your role/);
  });

  it("refuses a blank deny reason", async () => {
    const context = setup();
    const row = await submitted(context);

    const response = await context.flow.handle(denySubmit(moderator(), row._id, "   "));

    assert.match(response.data.content, /reason is required/);
    assert.equal(context.models.DiscordRsoRequests.docs[0].status, "pending");
  });

  it("still denies when the requester blocks direct messages", async () => {
    const context = setup();
    const row = await submitted(context);
    context.client.failDm = true;

    const response = await context.flow.handle(denySubmit(moderator(), row._id, "No"));

    assert.equal(response.type, UPDATE_MESSAGE);
    assert.equal(context.models.DiscordRsoRequests.docs[0].status, "denied");
  });

  it("treats an unknown or malformed request id as no longer available", async () => {
    const context = setup();

    const response = await context.flow.handle(click(moderator(), "rso-approve:not-an-id"));

    assert.match(response.data.content, /no longer available/);
  });
});

describe("Discord dispatcher", () => {
  // The real flows decide what they own; only their handlers are replaced to record where each went.
  function dispatcherWithRealOwnership() {
    const seen = [];
    const roles = createServerRoles({ modRoleId: MOD_ROLE });
    const recording = (label, flow) => ({ ...flow, handle: async (interaction) => seen.push([label, interaction.label]) });
    const events = createDiscordApprovals({ models: {}, directory: {}, client: {}, roles, config: {} });
    const rso = createRsoVerification({ models: {}, directory: {}, client: {}, roles, config: {} });
    const dispatcher = createDiscordDispatcher({ flows: [recording("events", events), recording("rso", rso)] });
    return { dispatcher, seen };
  }

  const interactions = {
    rsoCommand: { label: "rso command", type: 2, data: { name: "rso-verify" } },
    rsoAutocomplete: { label: "rso autocomplete", type: 4, data: { name: "rso-verify" } },
    rsoApprove: { label: "rso approve", type: 3, data: { custom_id: "rso-approve:1" } },
    rsoDeny: { label: "rso deny", type: 3, data: { custom_id: "rso-deny:1" } },
    rsoDenyReason: { label: "rso deny reason", type: 5, data: { custom_id: "rso-deny-reason:1" } },
    eventCommand: { label: "event command", type: 2, data: { name: "event" } },
    eventAutocomplete: { label: "event autocomplete", type: 4, data: { name: "event" } },
    eventSend: { label: "event send", type: 3, data: { custom_id: "event-send:1" } },
    eventForm: { label: "event form", type: 5, data: { custom_id: "event-form:1" } },
    eventApprove: { label: "event approve", type: 3, data: { custom_id: "event-approve:1" } },
    eventDeny: { label: "event deny", type: 3, data: { custom_id: "event-deny:1" } },
    earlierApprove: { label: "earlier approve", type: 3, data: { custom_id: "approve:1" } },
    earlierDenyReason: { label: "earlier deny reason", type: 5, data: { custom_id: "deny-reason:1" } },
  };

  it("sends each interaction to the flow that owns it, including review buttons posted before the event- prefix", async () => {
    const { dispatcher, seen } = dispatcherWithRealOwnership();
    for (const interaction of Object.values(interactions)) await dispatcher.handle(interaction);

    assert.deepEqual(seen, [
      ["rso", "rso command"],
      ["rso", "rso autocomplete"],
      ["rso", "rso approve"],
      ["rso", "rso deny"],
      ["rso", "rso deny reason"],
      ["events", "event command"],
      ["events", "event autocomplete"],
      ["events", "event send"],
      ["events", "event form"],
      ["events", "event approve"],
      ["events", "event deny"],
      ["events", "earlier approve"],
      ["events", "earlier deny reason"],
    ]);
  });

  it("refuses an interaction no flow owns instead of guessing", async () => {
    const { dispatcher, seen } = dispatcherWithRealOwnership();
    const response = await dispatcher.handle({ type: 3, data: { custom_id: "mystery:1" } });

    assert.deepEqual(seen, []);
    assert.equal(response.data.content, "This command is not available yet.");
  });

  it("acknowledges Discord first only for approvals, which do slow work", () => {
    const { dispatcher } = dispatcherWithRealOwnership();
    const acknowledgedFirst = Object.entries(interactions)
      .filter(([, interaction]) => dispatcher.shouldAcknowledgeFirst(interaction))
      .map(([name]) => name);

    assert.deepEqual(acknowledgedFirst, ["rsoApprove", "eventApprove", "earlierApprove"]);
  });
});
