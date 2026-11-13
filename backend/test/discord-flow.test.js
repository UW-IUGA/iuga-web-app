import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDiscordFlow } from "../discordFlow.js";
import { EVENT_COMMAND } from "../discordCommandDefinition.js";
import { createRsoRegistry } from "../rsoRegistry.js";

const NOW = new Date("2026-11-12T20:00:00Z");
const APPROVAL_CHANNEL = "approvals-channel";
const OFFICER_ROLE = "officer-role";
const MOD_ROLE = "mod-role";

const OFFICER_ID = "1001";
const MOD_ID = "2001";
const ADMIN_ID = "3001";
const OTHER_ID = "4001";
const UNLINKED_OFFICER_ID = "9999";

const EPHEMERAL = 64;
const CHANNEL_MESSAGE = 4;
const UPDATE_MESSAGE = 7;
const MODAL = 9;

function createCollection() {
  const docs = [];
  let sequence = 0;
  const matches = (doc, filter) =>
    Object.entries(filter).every(([key, value]) => String(doc[key]) === String(value));
  const copy = (doc) => (doc ? structuredClone(doc) : null);
  const apply = (doc, update) => {
    Object.assign(doc, update.$set ?? {});
    for (const key of Object.keys(update.$unset ?? {})) delete doc[key];
  };

  const collection = {
    docs,
    failCreate: false,
    async create(fields) {
      if (collection.failCreate) throw new Error("simulated insert failure");
      sequence += 1;
      const doc = { _id: String(sequence).padStart(24, "0"), ...structuredClone(fields) };
      docs.push(doc);
      return copy(doc);
    },
    async findById(id) {
      return copy(docs.find((doc) => doc._id === String(id)) ?? null);
    },
    async findOneAndUpdate(filter, update) {
      const doc = docs.find((candidate) => matches(candidate, filter));
      if (!doc) return null;
      apply(doc, update);
      return copy(doc);
    },
    async updateOne(filter, update) {
      const doc = docs.find((candidate) => matches(candidate, filter));
      if (doc) apply(doc, update);
      return { matchedCount: doc ? 1 : 0 };
    },
    async deleteOne(filter) {
      const index = docs.findIndex((candidate) => matches(candidate, filter));
      if (index >= 0) docs.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
  };
  return collection;
}

function createClient() {
  const calls = [];
  let messageSequence = 1000;
  const client = {
    calls,
    failPost: false,
    failDm: false,
    async postMessage(channelId, body) {
      calls.push({ method: "postMessage", channelId, body });
      if (client.failPost) throw new Error("Discord POST /channels/x/messages failed with status 500");
      messageSequence += 1;
      return { id: String(messageSequence) };
    },
    async sendDirectMessage(userId, body) {
      calls.push({ method: "sendDirectMessage", userId, body });
      if (client.failDm) throw new Error("Discord POST /users/@me/channels failed with status 403");
      return { id: "dm-1" };
    },
  };
  return client;
}

function setup() {
  const models = {
    DiscordEventSubmissions: createCollection(),
    Events: createCollection(),
  };
  const client = createClient();
  const flow = createDiscordFlow({
    models,
    registry: createRsoRegistry({
      [OFFICER_ID]: { rsoKey: "sigma", rsoName: "Sigma Society" },
    }),
    client,
    config: {
      officerRoleId: OFFICER_ROLE,
      modRoleId: MOD_ROLE,
      approvalChannelId: APPROVAL_CHANNEL,
    },
    now: () => NOW,
  });
  return { models, client, flow };
}

function member(id, roles = [], extra = {}) {
  return { user: { id, username: `user${id}`, global_name: null }, nick: null, roles, ...extra };
}

function eventOptions(overrides = {}) {
  const values = {
    name: "Game Night",
    date: "2026-12-01",
    start_time: "18:00",
    location: "Mary Gates Hall 110",
    category: "Social",
    description: "Board games and snacks.",
    ...overrides,
  };
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ({ name, type: 3, value }));
}

function commandInteraction(who, options = eventOptions()) {
  return { type: 2, member: who, channel_id: "some-channel", data: { name: "event", options } };
}

function componentInteraction(who, customId) {
  return { type: 3, member: who, message: { id: "card" }, data: { custom_id: customId, component_type: 2 } };
}

function modalSubmitInteraction(who, customId, reason = "") {
  return {
    type: 5,
    member: who,
    message: { id: "card" },
    data: {
      custom_id: customId,
      components: [{ type: 1, components: [{ type: 4, custom_id: "reason", value: reason }] }],
    },
  };
}

async function submitEvent(flow, options) {
  const response = await flow.handle(commandInteraction(member(OFFICER_ID, [OFFICER_ROLE]), options));
  assert.equal(response.type, CHANNEL_MESSAGE);
  assert.equal(response.data.flags, EPHEMERAL);
}

async function pendingSubmission(setupOptions = {}) {
  const context = setup();
  Object.assign(context.client, setupOptions);
  await submitEvent(context.flow);
  const [row] = context.models.DiscordEventSubmissions.docs;
  return { ...context, id: String(row._id) };
}

const officer = () => member(OFFICER_ID, [OFFICER_ROLE]);
const mod = () => member(MOD_ID, [MOD_ROLE]);

describe("/event submission", () => {
  it("refuses a non-officer and writes nothing", async () => {
    const { models, client, flow } = setup();
    const response = await flow.handle(commandInteraction(member(OTHER_ID, [])));

    assert.equal(response.type, CHANNEL_MESSAGE);
    assert.equal(response.data.flags, EPHEMERAL);
    assert.equal(models.DiscordEventSubmissions.docs.length, 0);
    assert.equal(client.calls.length, 0);
  });

  it("refuses an officer with no RSO entry and writes nothing", async () => {
    const { models, client, flow } = setup();
    const response = await flow.handle(commandInteraction(member(UNLINKED_OFFICER_ID, [OFFICER_ROLE])));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /not linked to an RSO/);
    assert.equal(models.DiscordEventSubmissions.docs.length, 0);
    assert.equal(client.calls.length, 0);
  });

  it("returns validation errors and writes nothing for an invalid event", async () => {
    const { models, client, flow } = setup();
    const response = await flow.handle(
      commandInteraction(officer(), eventOptions({ date: "2020-01-01" })),
    );

    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /The event must start in the future\./);
    assert.equal(models.DiscordEventSubmissions.docs.length, 0);
    assert.equal(client.calls.length, 0);
  });

  it("creates one pending row and posts one approval card with Approve and Deny buttons", async () => {
    const { models, client, flow } = setup();
    const response = await flow.handle(commandInteraction(officer()));

    assert.equal(response.type, CHANNEL_MESSAGE);
    assert.equal(response.data.flags, EPHEMERAL);

    const rows = models.DiscordEventSubmissions.docs;
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.status, "pending");
    assert.equal(row.submitterDiscordId, OFFICER_ID);
    assert.equal(row.rsoKey, "sigma");
    assert.equal(row.rsoName, "Sigma Society");
    assert.equal(row.eLabel, "Social");
    assert.equal(row.discordMessageId, "1001");

    assert.equal(client.calls.length, 1);
    const [post] = client.calls;
    assert.equal(post.channelId, APPROVAL_CHANNEL);
    assert.deepEqual(post.body.allowed_mentions, { parse: [] });
    assert.deepEqual(
      post.body.components[0].components.map((button) => button.custom_id),
      [`approve:${row._id}`, `deny:${row._id}`],
    );
  });

  it("deletes the row and reports an error when the approval card cannot be posted", async (t) => {
    t.mock.method(console, "error", () => {});
    const { models, client, flow } = setup();
    client.failPost = true;
    const response = await flow.handle(commandInteraction(officer()));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /not submitted/);
    assert.equal(models.DiscordEventSubmissions.docs.length, 0);
  });
});

describe("approval", () => {
  it("refuses approval from a non-moderator and changes nothing", async () => {
    const { id, models, flow } = await pendingSubmission();
    const response = await flow.handle(componentInteraction(member(OTHER_ID, []), `approve:${id}`));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "pending");
    assert.equal(models.Events.docs.length, 0);
  });

  it("publishes exactly one Events row for a moderator approval and updates the card", async () => {
    const { id, models, flow } = await pendingSubmission();
    const response = await flow.handle(componentInteraction(mod(), `approve:${id}`));

    assert.equal(response.type, UPDATE_MESSAGE);
    assert.deepEqual(response.data.components, []);

    assert.equal(models.Events.docs.length, 1);
    const [event] = models.Events.docs;
    assert.equal(event.eName, "Game Night");
    assert.equal(event.eOrganizers, "Sigma Society");
    assert.equal(event.eLocation, "Mary Gates Hall 110");
    assert.equal(event.eDescription, "Board games and snacks.");
    assert.deepEqual(event.eLabels, ["Social"]);
    assert.deepEqual(event.eStartDate, new Date("2026-12-02T02:00:00Z"));
    assert.equal(event.eEndDate, undefined);
    assert.equal(event.eAltLink, undefined);
    assert.equal(event.eThumbnailPath, undefined);
    assert.equal(event.eHost, undefined);

    const [row] = models.DiscordEventSubmissions.docs;
    assert.equal(row.status, "approved");
    assert.equal(row.reviewerDiscordId, MOD_ID);
    assert.equal(row.publishedEventId, event._id);
  });

  it("maps the RSVP link into eAltLink when one was given", async () => {
    const { models, flow } = setup();
    await submitEvent(flow, eventOptions({ rsvp_url: "https://example.com/rsvp" }));
    const [row] = models.DiscordEventSubmissions.docs;

    await flow.handle(componentInteraction(mod(), `approve:${String(row._id)}`));

    assert.equal(models.Events.docs.length, 1);
    assert.deepEqual(models.Events.docs[0].eAltLink, { title: "RSVP", url: "https://example.com/rsvp" });
  });

  it("does not publish a second time when approval is clicked again", async () => {
    const { id, models, flow } = await pendingSubmission();
    await flow.handle(componentInteraction(mod(), `approve:${id}`));
    const response = await flow.handle(componentInteraction(mod(), `approve:${id}`));

    assert.equal(models.Events.docs.length, 1);
    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /already been reviewed/);
  });

  it("refuses self-approval", async () => {
    const { id, models, flow } = await pendingSubmission();
    const selfReviewer = member(OFFICER_ID, [OFFICER_ROLE, MOD_ROLE]);
    const response = await flow.handle(componentInteraction(selfReviewer, `approve:${id}`));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /cannot approve your own event/);
    assert.equal(models.Events.docs.length, 0);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "pending");
  });

  it("lets a server administrator approve", async () => {
    const { id, models, flow } = await pendingSubmission();
    const admin = member(ADMIN_ID, [], { permissions: "8" });
    const response = await flow.handle(componentInteraction(admin, `approve:${id}`));

    assert.equal(response.type, UPDATE_MESSAGE);
    assert.equal(models.Events.docs.length, 1);
  });

  it("reverts to pending and tells the moderator when the Events insert fails", async (t) => {
    t.mock.method(console, "error", () => {});
    const { id, models, flow } = await pendingSubmission();
    models.Events.failCreate = true;

    const response = await flow.handle(componentInteraction(mod(), `approve:${id}`));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /still pending/);
    assert.equal(models.Events.docs.length, 0);
    const [row] = models.DiscordEventSubmissions.docs;
    assert.equal(row.status, "pending");
    assert.equal(row.reviewerDiscordId, undefined);
  });
});

describe("denial", () => {
  it("opens a reason modal without changing the row", async () => {
    const { id, models, flow } = await pendingSubmission();
    const response = await flow.handle(componentInteraction(mod(), `deny:${id}`));

    assert.equal(response.type, MODAL);
    assert.equal(response.data.custom_id, `deny-reason:${id}`);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "pending");
  });

  it("records the denial and reason, updates the card, and DMs the submitter", async () => {
    const { id, models, client, flow } = await pendingSubmission();
    const response = await flow.handle(
      modalSubmitInteraction(mod(), `deny-reason:${id}`, "Conflicts with finals"),
    );

    assert.equal(response.type, UPDATE_MESSAGE);
    const [row] = models.DiscordEventSubmissions.docs;
    assert.equal(row.status, "denied");
    assert.equal(row.denyReason, "Conflicts with finals");
    assert.equal(row.reviewerDiscordId, MOD_ID);
    assert.equal(models.Events.docs.length, 0);

    const dm = client.calls.find((call) => call.method === "sendDirectMessage");
    assert.equal(dm.userId, OFFICER_ID);
    assert.match(dm.body.content, /Conflicts with finals/);
  });

  it("keeps the denial when the submitter DM fails", async () => {
    const { id, models, client, flow } = await pendingSubmission();
    client.failDm = true;
    const response = await flow.handle(modalSubmitInteraction(mod(), `deny-reason:${id}`, ""));

    assert.equal(response.type, UPDATE_MESSAGE);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "denied");
    assert.equal(models.DiscordEventSubmissions.docs[0].denyReason, undefined);
  });

  it("refuses denial from a non-moderator", async () => {
    const { id, models, flow } = await pendingSubmission();
    const response = await flow.handle(componentInteraction(member(OTHER_ID, []), `deny:${id}`));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "pending");
  });
});

describe("interaction dispatch", () => {
  it("answers an unknown interaction with a private not-available reply", async () => {
    const { flow } = setup();
    const response = await flow.handle({ type: 99, member: mod(), data: {} });

    assert.equal(response.data.flags, EPHEMERAL);
    assert.equal(response.data.content, "This command is not available yet.");
  });

  it("treats a malformed id as stale and never looks it up", async () => {
    const { models, flow } = await pendingSubmission();
    const response = await flow.handle(componentInteraction(mod(), "approve:not-an-id"));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "pending");
    assert.equal(models.Events.docs.length, 0);
  });
});

describe("command definition", () => {
  it("puts every required option before every optional one", () => {
    const { options } = EVENT_COMMAND;
    for (const [index, option] of options.entries()) {
      if (!option.required) continue;
      assert.ok(
        options.slice(0, index).every((earlier) => earlier.required),
        `required option ${option.name} follows an optional option`,
      );
    }
  });
});
