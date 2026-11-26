import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDiscordApprovals } from "../discord/events/approvals.js";
import { EVENT_COMMAND } from "../discord/commandDefinition.js";
import { createServerRoles } from "../discord/roles.js";

const NOW = new Date("2026-11-12T20:00:00Z");
const APPROVAL_CHANNEL = "approvals-channel";
const ANNOUNCEMENT_CHANNEL = "rso-events-channel";
const GUILD_ID = "guild-1";
const OFFICER_ROLE = "officer-role";
const MOD_ROLE = "mod-role";
const IUGA_OFFICER_ROLE = "iuga-officer-role";

const OFFICER_ID = "1001";
const MOD_ID = "2001";
const ADMIN_ID = "3001";
const OTHER_ID = "4001";
const MULTI_RSO_OFFICER_ID = "9999";

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
    async findOneAndDelete(filter) {
      const index = docs.findIndex((candidate) => matches(candidate, filter));
      return index >= 0 ? copy(docs.splice(index, 1)[0]) : null;
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
      if (client.failPost) {
        throw new Error('Discord POST /channels/x/messages failed with status 403, code 50001 "Missing Access"');
      }
      messageSequence += 1;
      return { id: String(messageSequence) };
    },
    async createScheduledEvent(guildId, body) {
      calls.push({ method: "createScheduledEvent", guildId, body });
      return { id: "scheduled-1" };
    },
    async sendDirectMessage(userId, body) {
      calls.push({ method: "sendDirectMessage", userId, body });
      if (client.failDm) throw new Error("Discord POST /users/@me/channels failed with status 403");
      return { id: "dm-1" };
    },
  };
  return client;
}

function createDirectory(rsosByUser, { fails = false } = {}) {
  return {
    async rsosOf(who) {
      if (fails) throw new Error("directory down");
      return rsosByUser[who.user.id] ?? [];
    },
  };
}

function setup({ directoryFails = false } = {}) {
  const events = createCollection();
  const models = {
    DiscordEventSubmissions: createCollection(),
    DiscordEventDrafts: createCollection(),
    Events: {
      ...events,
      async startSession() {
        return { withTransaction: (work) => work(), async endSession() {} };
      },
      async create([fields]) {
        events.failCreate = this.failCreate;
        return [await events.create(fields)];
      },
    },
  };
  const client = createClient();
  const rsosByUser = {
    [OFFICER_ID]: [{ rsoKey: "iuga", rsoName: "IUGA" }],
    [MULTI_RSO_OFFICER_ID]: [
      { rsoKey: "iuga", rsoName: "IUGA" },
      { rsoKey: "winfo", rsoName: "WINFO" },
    ],
  };
  const clock = { now: NOW };
  const flow = createDiscordApprovals({
    models,
    directory: createDirectory(rsosByUser, { fails: directoryFails }),
    client,
    roles: createServerRoles({ modRoleId: MOD_ROLE, iugaOfficerRoleId: IUGA_OFFICER_ROLE, officerRoleId: OFFICER_ROLE }),
    config: {
      approvalChannelId: APPROVAL_CHANNEL,
      announcementChannelId: ANNOUNCEMENT_CHANNEL,
      guildId: GUILD_ID,
    },
    now: () => clock.now,
  });
  const advance = (ms) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };
  return { models, client, flow, rsosByUser, advance };
}

function member(id, roles = [], extra = {}) {
  return { user: { id, username: `user${id}`, global_name: null }, nick: null, roles, ...extra };
}

const FORM_FIELDS = {
  name: "IUGA Study Break",
  when: "Dec 1 6-8pm",
  location: "Mary Gates Hall",
  categories: ["Social", "Career"],
  description: "Snacks and a quiet room for Informatics undergrads.",
};

function commandInteraction(who, options = []) {
  return { type: 2, member: who, channel_id: "some-channel", data: { name: "event", options } };
}

function rsoOption(value) {
  return [{ name: "rso", type: 3, value }];
}

function autocompleteInteraction(who, typed) {
  return {
    type: 4,
    member: who,
    data: { name: "event", options: [{ name: "rso", type: 3, value: typed, focused: true }] },
  };
}

function formSubmitInteraction(who, draftId, overrides = {}) {
  const fields = { ...FORM_FIELDS, ...overrides };
  return {
    type: 5,
    member: who,
    data: {
      custom_id: `event-form:${draftId}`,
      components: Object.entries(fields).map(([fieldId, answer], index) => ({
        type: 18,
        id: index * 2 + 1,
        component:
          fieldId === "categories"
            ? { type: 3, id: index * 2 + 2, custom_id: fieldId, values: answer }
            : { type: 4, id: index * 2 + 2, custom_id: fieldId, value: answer },
      })),
    },
  };
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

const officer = () => member(OFFICER_ID, [OFFICER_ROLE]);
const mod = () => member(MOD_ID, [MOD_ROLE]);
const multiOfficer = () => member(MULTI_RSO_OFFICER_ID, [OFFICER_ROLE]);

const BUTTON = 2;

function buttonIds(response) {
  const ids = [];
  for (const row of response.data.components ?? []) {
    for (const part of row.components) {
      if (part.type === BUTTON) ids.push(part.custom_id);
    }
  }
  return ids;
}
const draftIdOf = (formResponse) => formResponse.data.custom_id.split(":")[1];

async function openDraft(flow, who = officer(), options = []) {
  const response = await flow.handle(commandInteraction(who, options));
  assert.equal(response.type, MODAL);
  return draftIdOf(response);
}

async function previewEvent(flow, overrides) {
  const draftId = await openDraft(flow);
  const preview = await flow.handle(formSubmitInteraction(officer(), draftId, overrides));
  return { draftId, preview };
}

async function submitEvent(flow, overrides) {
  const { draftId, preview } = await previewEvent(flow, overrides);
  const sent = await flow.handle(componentInteraction(officer(), `event-send:${draftId}`));
  return { draftId, preview, sent };
}

async function pendingSubmission(setupOptions = {}) {
  const context = setup();
  Object.assign(context.client, setupOptions);
  await submitEvent(context.flow);
  const [row] = context.models.DiscordEventSubmissions.docs;
  return { ...context, id: String(row._id) };
}

function assertNothingSubmitted({ models, client }) {
  assert.equal(models.DiscordEventSubmissions.docs.length, 0);
  assert.equal(client.calls.length, 0);
}

describe("/event command", () => {
  it("points a member with no verified RSO to /rso-verify without opening the form", async () => {
    const context = setup();
    const response = await context.flow.handle(commandInteraction(member(OTHER_ID, [])));

    assert.equal(response.type, CHANNEL_MESSAGE);
    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /\/rso-verify/);
    assert.equal(context.models.DiscordEventDrafts.docs.length, 0);
    assertNothingSubmitted(context);
  });

  it("starts a draft for an officer's only RSO and opens its form", async () => {
    const context = setup();
    const response = await context.flow.handle(commandInteraction(officer()));

    assert.equal(response.type, MODAL);
    const [draft] = context.models.DiscordEventDrafts.docs;
    assert.equal(response.data.custom_id, `event-form:${draft._id}`);
    assert.equal(draft.submitterDiscordId, OFFICER_ID);
    assert.equal(draft.rsoKey, "iuga");
    assert.equal(draft.rsoName, "IUGA");
    assert.deepEqual(draft.expiresAt, new Date(NOW.getTime() + 60 * 60 * 1000));
    assertNothingSubmitted(context);
  });

  it("starts the draft for the RSO an officer of several picked", async () => {
    const { flow, models } = setup();
    await openDraft(flow, multiOfficer(), rsoOption("winfo"));
    assert.equal(models.DiscordEventDrafts.docs[0].rsoKey, "winfo");
  });

  it("asks an officer of several RSOs to pick one, listing only theirs, without opening the form", async () => {
    const context = setup();
    const response = await context.flow.handle(commandInteraction(multiOfficer()));

    assert.equal(response.type, CHANNEL_MESSAGE);
    assert.match(response.data.content, /IUGA/);
    assert.match(response.data.content, /WINFO/);
    assert.match(response.data.content, /rso/);
    assert.equal(context.models.DiscordEventDrafts.docs.length, 0);
  });

  it("refuses an RSO the officer isn't verified for", async () => {
    const { flow, models } = setup();
    for (const [who, picked] of [
      [officer(), "winfo"],
      [multiOfficer(), "binfo"],
    ]) {
      const response = await flow.handle(commandInteraction(who, rsoOption(picked)));
      assert.equal(response.type, CHANNEL_MESSAGE, picked);
      assert.match(response.data.content, /only submit events for an RSO you're verified for/, picked);
    }
    assert.equal(models.DiscordEventDrafts.docs.length, 0);
  });

  it("points a member with no RSO to /rso-verify even when they name one", async () => {
    const { flow } = setup();
    const response = await flow.handle(commandInteraction(member(OTHER_ID, []), rsoOption("iuga")));
    assert.match(response.data.content, /\/rso-verify/);
  });

  it("still opens the form when Discord sends the old command's field options", async () => {
    const { flow } = setup();
    const oldOptions = [
      { name: "name", type: 3, value: "Old style" },
      { name: "date", type: 3, value: "2026-12-01" },
    ];
    const response = await flow.handle(commandInteraction(officer(), oldOptions));
    assert.equal(response.type, MODAL);
  });
});

describe("/event rso autocomplete", () => {
  const AUTOCOMPLETE_RESULT = 8;

  it("suggests only the member's own RSOs that match what they typed", async () => {
    const { flow } = setup();
    const matching = await flow.handle(autocompleteInteraction(multiOfficer(), "wi"));
    assert.equal(matching.type, AUTOCOMPLETE_RESULT);
    assert.deepEqual(matching.data.choices, [{ name: "WINFO", value: "winfo" }]);

    const all = await flow.handle(autocompleteInteraction(multiOfficer(), ""));
    assert.deepEqual(
      all.data.choices.map((choice) => choice.value),
      ["iuga", "winfo"],
    );
  });

  it("suggests nothing to a member with no RSO", async () => {
    const { flow } = setup();
    const response = await flow.handle(autocompleteInteraction(member(OTHER_ID, []), ""));
    assert.deepEqual(response.data.choices, []);
  });

  it("suggests nothing and logs when the directory fails", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    const { flow } = setup({ directoryFails: true });
    const response = await flow.handle(autocompleteInteraction(multiOfficer(), ""));

    assert.equal(response.type, AUTOCOMPLETE_RESULT);
    assert.deepEqual(response.data.choices, []);
    assert.match(logged.mock.calls[0].arguments.join(" "), /directory down/);
  });
});

describe("/event form submit", () => {
  it("saves the answers and shows a private preview with Send and Edit, submitting nothing yet", async () => {
    const context = setup();
    const { draftId, preview } = await previewEvent(context.flow);

    assert.equal(preview.type, CHANNEL_MESSAGE);
    assert.equal(preview.data.flags, EPHEMERAL);
    const [card] = preview.data.embeds;
    assert.equal(card.title, "IUGA Study Break");
    assert.match(card.fields.find((field) => field.name === "When").value, /Dec 1, 2026, 6:00\s?PM Pacific to 8:00\s?PM/);
    assert.equal(card.fields.find((field) => field.name === "Categories").value, "Social, Career");
    assert.deepEqual(buttonIds(preview), [`event-send:${draftId}`, `event-edit:${draftId}`]);

    assert.deepEqual(context.models.DiscordEventDrafts.docs[0].entries, FORM_FIELDS);
    assertNothingSubmitted(context);
  });

  it("lists the problems with a Fix it button, submitting nothing", async () => {
    const context = setup();
    const { draftId, preview } = await previewEvent(context.flow, { when: "sometime", location: "" });

    assert.equal(preview.data.flags, EPHEMERAL);
    assert.deepEqual(preview.data.allowed_mentions, { parse: [] });
    assert.match(preview.data.content, /When: Couldn't read When/);
    assert.match(preview.data.content, /Location: Location is required/);
    assert.deepEqual(buttonIds(preview), [`event-edit:${draftId}`]);
    assert.equal(context.models.DiscordEventDrafts.docs[0].entries.when, "sometime");
    assertNothingSubmitted(context);
  });

  it("refuses a form for someone else's draft, or one that doesn't exist", async () => {
    const context = setup();
    const draftId = await openDraft(context.flow);
    for (const [who, id] of [
      [multiOfficer(), draftId],
      [officer(), "ffffffffffffffffffffffff"],
      [officer(), "not-an-id"],
    ]) {
      const response = await context.flow.handle(formSubmitInteraction(who, id));
      assert.match(response.data.content, /This draft expired\. Run \/event again\./, id);
    }
    assert.deepEqual(context.models.DiscordEventDrafts.docs[0].entries, undefined);
    assertNothingSubmitted(context);
  });

  it("refuses a form once its draft has expired", async () => {
    const { flow, advance } = setup();
    const draftId = await openDraft(flow);
    advance(61 * 60 * 1000);
    const response = await flow.handle(formSubmitInteraction(officer(), draftId));
    assert.match(response.data.content, /This draft expired/);
  });

  it("refuses a form from an officer who lost their RSO role after opening it", async () => {
    const context = setup();
    const draftId = await openDraft(context.flow);
    delete context.rsosByUser[OFFICER_ID];
    const response = await context.flow.handle(formSubmitInteraction(officer(), draftId));
    assert.match(response.data.content, /\/rso-verify/);
    assertNothingSubmitted(context);
  });
});

describe("/event preview buttons", () => {
  it("Send for review posts one approval card, deletes the draft, and closes the preview", async () => {
    const context = setup();
    const { sent } = await submitEvent(context.flow);

    const rows = context.models.DiscordEventSubmissions.docs;
    assert.equal(rows.length, 1);
    const [row] = rows;
    assert.equal(row.status, "pending");
    assert.equal(row.submitterDiscordId, OFFICER_ID);
    assert.equal(row.rsoKey, "iuga");
    assert.deepEqual(row.eLabels, ["Social", "Career"]);
    assert.deepEqual(row.eStartDate, new Date("2026-12-02T02:00:00Z"));
    assert.deepEqual(row.eEndDate, new Date("2026-12-02T04:00:00Z"));
    assert.equal(row.discordMessageId, "1001");

    const [post] = context.client.calls;
    assert.equal(post.channelId, APPROVAL_CHANNEL);
    assert.deepEqual(post.body.allowed_mentions, { parse: [] });
    assert.deepEqual(buttonIds({ data: post.body }), [`event-approve:${row._id}`, `event-deny:${row._id}`]);
    assert.deepEqual(post.body.embeds[0].fields.find((field) => field.name === "Categories"), {
      name: "Categories",
      value: "Social, Career",
      inline: true,
    });

    assert.equal(sent.type, UPDATE_MESSAGE);
    assert.match(sent.data.content, /Sent \*\*IUGA Study Break\*\* for review/);
    assert.deepEqual(sent.data.components, []);
    assert.equal(context.models.DiscordEventDrafts.docs.length, 0);
  });

  it("posts one approval card when Send is double-clicked", async () => {
    const context = setup();
    const { draftId } = await previewEvent(context.flow);
    const click = () => context.flow.handle(componentInteraction(officer(), `event-send:${draftId}`));
    await Promise.all([click(), click()]);

    assert.equal(context.models.DiscordEventSubmissions.docs.length, 1);
    assert.equal(context.client.calls.length, 1);
  });

  it("Send a second time finds no draft and posts nothing more", async () => {
    const context = setup();
    const { draftId } = await submitEvent(context.flow);
    const again = await context.flow.handle(componentInteraction(officer(), `event-send:${draftId}`));

    assert.match(again.data.content, /This draft expired/);
    assert.equal(context.models.DiscordEventSubmissions.docs.length, 1);
  });

  it("Edit reopens the form with the officer's answers filled in", async () => {
    const { flow } = setup();
    const { draftId } = await previewEvent(flow);
    const response = await flow.handle(componentInteraction(officer(), `event-edit:${draftId}`));

    assert.equal(response.type, MODAL);
    assert.equal(response.data.custom_id, `event-form:${draftId}`);
    const fields = Object.fromEntries(response.data.components.map((label) => [label.component.custom_id, label]));
    assert.equal(fields.name.component.value, "IUGA Study Break");
    assert.equal(fields.when.component.value, "Dec 1 6-8pm");
  });

  it("Fix it reopens the form with the problem shown under When", async () => {
    const { flow } = setup();
    const { draftId } = await previewEvent(flow, { when: "sometime" });
    const response = await flow.handle(componentInteraction(officer(), `event-edit:${draftId}`));

    const fields = Object.fromEntries(response.data.components.map((label) => [label.component.custom_id, label]));
    assert.match(fields.when.description, /^⚠ Couldn't read When/);
    assert.equal(fields.when.component.value, "sometime");
    assert.equal(fields.location.component.value, "Mary Gates Hall");
  });

  it("refuses Send or Edit on someone else's draft", async () => {
    const context = setup();
    const { draftId } = await previewEvent(context.flow);
    for (const action of ["event-send", "event-edit"]) {
      const response = await context.flow.handle(componentInteraction(multiOfficer(), `${action}:${draftId}`));
      assert.equal(response.type, CHANNEL_MESSAGE, action);
      assert.match(response.data.content, /This draft expired/, action);
    }
    assertNothingSubmitted(context);
  });

  it("refuses Send when the officer lost their RSO role after the preview", async () => {
    const context = setup();
    const { draftId } = await previewEvent(context.flow);
    delete context.rsosByUser[OFFICER_ID];
    const response = await context.flow.handle(componentInteraction(officer(), `event-send:${draftId}`));

    assert.match(response.data.content, /\/rso-verify/);
    assertNothingSubmitted(context);
  });

  it("turns the preview into a Fix it note when the start time passed before Send", async () => {
    const context = setup();
    // NOW is Nov 12, noon Pacific; the draft is still current 45 minutes later, but the event has started.
    const { draftId } = await previewEvent(context.flow, { when: "Nov 12 12:30-2pm" });
    context.advance(45 * 60 * 1000);
    const response = await context.flow.handle(componentInteraction(officer(), `event-send:${draftId}`));

    assert.equal(response.type, UPDATE_MESSAGE);
    assert.match(response.data.content, /When: The event must start in the future/);
    assert.deepEqual(buttonIds(response), [`event-edit:${draftId}`]);
    assertNothingSubmitted(context);
  });

  it("keeps the draft and says so when the approval card can't be posted", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    const context = setup();
    context.client.failPost = true;
    const { sent } = await submitEvent(context.flow);

    assert.equal(sent.type, CHANNEL_MESSAGE);
    assert.match(sent.data.content, /Click Send for review again/);
    assert.doesNotMatch(sent.data.content, /50001|Missing Access/);
    assert.match(logged.mock.calls[0].arguments.join(" "), /50001 "Missing Access"/);
    assert.equal(context.models.DiscordEventSubmissions.docs.length, 0);
    assert.equal(context.models.DiscordEventDrafts.docs.length, 1);
  });
});

describe("approval announces the event", () => {
  const announcementPosts = (client) =>
    client.calls.filter((call) => call.method === "postMessage" && call.channelId === ANNOUNCEMENT_CHANNEL);

  it("posts one announcement to the announcement channel and saves the IDs", async () => {
    const { id, models, flow, client } = await pendingSubmission();

    await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.equal(announcementPosts(client).length, 1);
    assert.equal(client.calls.filter((call) => call.method === "createScheduledEvent").length, 1);
    const [row] = models.DiscordEventSubmissions.docs;
    assert.equal(row.announcementChannelId, ANNOUNCEMENT_CHANNEL);
    assert.ok(row.announcementMessageId);
    assert.equal(row.scheduledEventId, "scheduled-1");
  });

  it("keeps the event published and shows the failure on the card when the announcement fails", async () => {
    const { id, models, flow, client } = await pendingSubmission();
    client.failPost = true;

    const response = await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.equal(models.Events.docs.length, 1);
    assert.match(response.data.embeds[0].footer.text, /Published to the Events page\. Discord announcement failed\./);
    const [row] = models.DiscordEventSubmissions.docs;
    assert.equal(row.announcementMessageId, undefined);
    assert.equal(row.scheduledEventId, "scheduled-1");
  });

  it("announces once when Approve is clicked twice", async () => {
    const { id, flow, client } = await pendingSubmission();

    await flow.handle(componentInteraction(mod(), `event-approve:${id}`));
    await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.equal(announcementPosts(client).length, 1);
  });

  it("announces once when two moderators click Approve at the same moment", async () => {
    const { id, flow, client } = await pendingSubmission();

    await Promise.all([
      flow.handle(componentInteraction(mod(), `event-approve:${id}`)),
      flow.handle(componentInteraction(mod(), `event-approve:${id}`)),
    ]);

    assert.equal(announcementPosts(client).length, 1);
  });

  it("keeps the published event and the announcement when saving the announcement IDs fails", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    const { id, models, flow, client } = await pendingSubmission();
    const saveSubmission = models.DiscordEventSubmissions.updateOne;
    models.DiscordEventSubmissions.updateOne = (filter, update) => {
      if (update.$set?.announcementMessageId) throw new Error("database down");
      return saveSubmission(filter, update);
    };

    const response = await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.equal(models.Events.docs.length, 1);
    assert.equal(announcementPosts(client).length, 1);
    assert.match(response.data.embeds[0].footer.text, /Published to the Events page\./);
    assert.match(logged.mock.calls.map((call) => call.arguments.join(" ")).join("\n"), /Saving announcement IDs failed: database down/);
  });
});

describe("approval", () => {
  it("refuses approval from a non-moderator and changes nothing", async () => {
    const { id, models, flow } = await pendingSubmission();
    const response = await flow.handle(componentInteraction(member(OTHER_ID, []), `event-approve:${id}`));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "pending");
    assert.equal(models.Events.docs.length, 0);
  });

  it("publishes exactly one Events row for a moderator approval and updates the card", async () => {
    const { id, models, flow } = await pendingSubmission();
    const response = await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.equal(response.type, UPDATE_MESSAGE);
    assert.deepEqual(response.data.components, []);

    assert.equal(models.Events.docs.length, 1);
    const [event] = models.Events.docs;
    assert.equal(event.eName, "IUGA Study Break");
    assert.equal(event.eOrganizers, "IUGA");
    assert.equal(event.eLocation, "Mary Gates Hall");
    assert.equal(event.eDescription, "Snacks and a quiet room for Informatics undergrads.");
    assert.deepEqual(event.eLabels, ["Social", "Career"]);
    assert.deepEqual(event.eStartDate, new Date("2026-12-02T02:00:00Z"));
    assert.deepEqual(event.eEndDate, new Date("2026-12-02T04:00:00Z"));
    assert.equal(event.eAltLink, undefined);
    assert.equal(event.eThumbnailPath, undefined);
    assert.equal(event.eHost, undefined);

    const [row] = models.DiscordEventSubmissions.docs;
    assert.equal(row.status, "approved");
    assert.equal(row.reviewerDiscordId, MOD_ID);
    assert.equal(row.publishedEventId, event._id);
  });

  it("still maps an RSVP link from a submission made before the form dropped it", async () => {
    const { id, models, flow } = await pendingSubmission();
    await models.DiscordEventSubmissions.updateOne({ _id: id }, { $set: { rsvpUrl: "https://example.com/rsvp" } });

    await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.equal(models.Events.docs.length, 1);
    assert.deepEqual(models.Events.docs[0].eAltLink, { title: "RSVP", url: "https://example.com/rsvp" });
  });

  it("publishes the single category of a submission made before categories became a list", async () => {
    const { id, models, flow } = await pendingSubmission();
    const [row] = models.DiscordEventSubmissions.docs;
    delete row.eLabels;
    row.eLabel = "Academic";

    await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.deepEqual(models.Events.docs[0].eLabels, ["Academic"]);
  });

  it("does not publish a second time when approval is clicked again", async () => {
    const { id, models, flow } = await pendingSubmission();
    await flow.handle(componentInteraction(mod(), `event-approve:${id}`));
    const response = await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.equal(models.Events.docs.length, 1);
    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /already been reviewed/);
  });

  it("refuses self-approval", async () => {
    const { id, models, flow } = await pendingSubmission();
    const selfReviewer = member(OFFICER_ID, [OFFICER_ROLE, MOD_ROLE]);
    const response = await flow.handle(componentInteraction(selfReviewer, `event-approve:${id}`));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /cannot approve your own event/);
    assert.equal(models.Events.docs.length, 0);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "pending");
  });

  it("lets an IUGA officer approve", async () => {
    const { id, models, flow } = await pendingSubmission();
    const iugaOfficer = member(ADMIN_ID, [IUGA_OFFICER_ROLE]);
    const response = await flow.handle(componentInteraction(iugaOfficer, `event-approve:${id}`));

    assert.equal(response.type, UPDATE_MESSAGE);
    assert.equal(models.Events.docs.length, 1);
  });

  it("lets an IUGA officer open the denial", async () => {
    const { id, flow } = await pendingSubmission();
    const iugaOfficer = member(ADMIN_ID, [IUGA_OFFICER_ROLE]);
    const response = await flow.handle(componentInteraction(iugaOfficer, `event-deny:${id}`));

    assert.equal(response.type, MODAL);
  });

  it("lets a server administrator approve", async () => {
    const { id, models, flow } = await pendingSubmission();
    const admin = member(ADMIN_ID, [], { permissions: "8" });
    const response = await flow.handle(componentInteraction(admin, `event-approve:${id}`));

    assert.equal(response.type, UPDATE_MESSAGE);
    assert.equal(models.Events.docs.length, 1);
  });

  it("keeps the request pending and tells the moderator when the Events insert fails", async (t) => {
    t.mock.method(console, "error", () => {});
    const { id, models, flow } = await pendingSubmission();
    models.Events.failCreate = true;

    const response = await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.match(response.data.content, /Couldn't confirm publication/);
    assert.equal(models.Events.docs.length, 0);
    const [row] = models.DiscordEventSubmissions.docs;
    assert.equal(row.status, "pending");
    assert.equal(row.reviewerDiscordId, undefined);
  });

  it("logs the insert failure detail but keeps it out of the moderator's reply", async (t) => {
    const logged = t.mock.method(console, "error", () => {});
    const { id, models, flow } = await pendingSubmission();
    models.Events.failCreate = true;

    const response = await flow.handle(componentInteraction(mod(), `event-approve:${id}`));

    assert.match(logged.mock.calls[0].arguments.join(" "), /simulated insert failure/);
    assert.doesNotMatch(response.data.content, /simulated insert failure/);
  });
});

describe("denial", () => {
  it("opens a reason modal without changing the row", async () => {
    const { id, models, flow } = await pendingSubmission();
    const response = await flow.handle(componentInteraction(mod(), `event-deny:${id}`));

    assert.equal(response.type, MODAL);
    assert.equal(response.data.custom_id, `event-deny-reason:${id}`);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "pending");
  });

  it("records the denial and reason, updates the card, and DMs the submitter", async () => {
    const { id, models, client, flow } = await pendingSubmission();
    const response = await flow.handle(
      modalSubmitInteraction(mod(), `event-deny-reason:${id}`, "Conflicts with finals"),
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
    const response = await flow.handle(modalSubmitInteraction(mod(), `event-deny-reason:${id}`, ""));

    assert.equal(response.type, UPDATE_MESSAGE);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "denied");
    assert.equal(models.DiscordEventSubmissions.docs[0].denyReason, undefined);
  });

  it("refuses denial from a non-moderator", async () => {
    const { id, models, flow } = await pendingSubmission();
    const response = await flow.handle(componentInteraction(member(OTHER_ID, []), `event-deny:${id}`));

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
    const response = await flow.handle(componentInteraction(mod(), "event-approve:not-an-id"));

    assert.equal(response.data.flags, EPHEMERAL);
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "pending");
    assert.equal(models.Events.docs.length, 0);
  });

  it("still approves from a card posted before review buttons had the event- prefix", async () => {
    const { models, flow, id } = await pendingSubmission();
    assert.ok(flow.owns(componentInteraction(mod(), `approve:${id}`)));
    assert.ok(flow.shouldAcknowledgeFirst(componentInteraction(mod(), `approve:${id}`)));

    await flow.handle(componentInteraction(mod(), `approve:${id}`));
    assert.equal(models.DiscordEventSubmissions.docs[0].status, "approved");
  });

  it("still denies from a deny-reason form opened before the event- prefix", async () => {
    const { models, flow, id } = await pendingSubmission();
    await flow.handle(modalSubmitInteraction(mod(), `deny-reason:${id}`, "Conflicts with finals"));

    assert.equal(models.DiscordEventSubmissions.docs[0].status, "denied");
  });

  it("doesn't claim a button named after a built-in object property", () => {
    const { flow } = setup();
    for (const name of ["constructor", "toString", "__proto__"]) {
      assert.equal(flow.owns(componentInteraction(mod(), `${name}:abc`)), false);
    }
  });
});

describe("command definition", () => {
  it("offers only the optional rso picker, since the form collects the event", () => {
    assert.deepEqual(
      EVENT_COMMAND.options.map((option) => [option.name, Boolean(option.required), Boolean(option.autocomplete)]),
      [["rso", false, true]],
    );
  });

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

describe("/event audience roles", () => {
  const SWE_ROLE = "swe-role";
  const UX_ROLE = "ux-role";
  const role = (id, extra = {}) => ({ id, name: id, mentionable: true, managed: false, ...extra });

  function audienceInteraction(who, draftId, roles) {
    return {
      type: 3,
      member: who,
      message: { id: "preview" },
      data: {
        custom_id: `event-audience:${draftId}`,
        component_type: 6,
        values: roles.map((picked) => picked.id),
        resolved: { roles: Object.fromEntries(roles.map((picked) => [picked.id, picked])) },
      },
    };
  }

  const picker = (response) => response.data.components.flatMap((row) => row.components).find((part) => part.type === 6);
  const notifies = (card) => card.fields.find((field) => field.name === "Notifies").value;

  it("offers an optional role picker of up to three roles on the preview", async () => {
    const { draftId, preview } = await previewEvent(setup().flow);

    const select = picker(preview);
    assert.equal(select.custom_id, `event-audience:${draftId}`);
    assert.equal(select.min_values, 0);
    assert.equal(select.max_values, 3);
    assert.equal(notifies(preview.data.embeds[0]), "No role pings");
  });

  it("carries picked interest roles to the approval card and pings only them on approval", async () => {
    const context = setup();
    const { draftId } = await previewEvent(context.flow);

    const picked = await context.flow.handle(audienceInteraction(officer(), draftId, [role(SWE_ROLE), role(UX_ROLE)]));
    assert.equal(picked.type, UPDATE_MESSAGE);
    assert.deepEqual(picked.data.allowed_mentions, { parse: [] });
    assert.equal(notifies(picked.data.embeds[0]), `<@&${SWE_ROLE}> <@&${UX_ROLE}>`);
    assert.deepEqual(picker(picked).default_values, [
      { id: SWE_ROLE, type: "role" },
      { id: UX_ROLE, type: "role" },
    ]);

    await context.flow.handle(componentInteraction(officer(), `event-send:${draftId}`));
    const [row] = context.models.DiscordEventSubmissions.docs;
    assert.deepEqual(row.interestRoleIds, [SWE_ROLE, UX_ROLE]);
    const approvalCard = context.client.calls.find((call) => call.channelId === APPROVAL_CHANNEL).body;
    assert.deepEqual(approvalCard.allowed_mentions, { parse: [] });
    assert.equal(notifies(approvalCard.embeds[0]), `<@&${SWE_ROLE}> <@&${UX_ROLE}>`);

    await context.flow.handle(componentInteraction(mod(), `event-approve:${row._id}`));
    const announcement = context.client.calls.find((call) => call.channelId === ANNOUNCEMENT_CHANNEL).body;
    assert.equal(announcement.content, `<@&${SWE_ROLE}> <@&${UX_ROLE}>`);
    assert.deepEqual(announcement.allowed_mentions, { roles: [SWE_ROLE, UX_ROLE] });
  });

  it("drops @everyone, staff, officer, bot-managed, and unmentionable roles and says which", async () => {
    const context = setup();
    const { draftId } = await previewEvent(context.flow);

    for (const refused of [
      role(GUILD_ID, { name: "@everyone" }),
      role(MOD_ROLE),
      role(IUGA_OFFICER_ROLE),
      role(OFFICER_ROLE),
      role("bot-role", { managed: true }),
      role("winfo-role", { mentionable: false }),
      role("old-admins", { permissions: String(1n << 5n) }),
      role("WINFO Officer"),
    ]) {
      const response = await context.flow.handle(audienceInteraction(officer(), draftId, [refused, role(SWE_ROLE)]));
      assert.match(response.data.content, new RegExp(`${refused.name.replace("@", "@​")} can't be notified`));
      assert.equal(notifies(response.data.embeds[0]), `<@&${SWE_ROLE}>`);
      assert.deepEqual(context.models.DiscordEventDrafts.docs[0].interestRoleIds, [SWE_ROLE]);
    }
  });

  it("clears the roles when the officer empties the picker", async () => {
    const context = setup();
    const { draftId } = await previewEvent(context.flow);
    await context.flow.handle(audienceInteraction(officer(), draftId, [role(SWE_ROLE)]));

    const cleared = await context.flow.handle(audienceInteraction(officer(), draftId, []));
    assert.equal(notifies(cleared.data.embeds[0]), "No role pings");
    assert.deepEqual(context.models.DiscordEventDrafts.docs[0].interestRoleIds, []);
  });

  it("refuses to change roles on someone else's draft", async () => {
    const context = setup();
    const { draftId } = await previewEvent(context.flow);

    const response = await context.flow.handle(audienceInteraction(multiOfficer(), draftId, [role(SWE_ROLE)]));
    assert.match(response.data.content, /expired/);
    assert.deepEqual(context.models.DiscordEventDrafts.docs[0].interestRoleIds ?? [], []);
  });
});
