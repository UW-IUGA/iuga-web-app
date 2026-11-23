import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEventAnnouncements } from "../discordAnnouncements.js";

const NOW = new Date("2026-11-20T12:00:00-08:00");
const CHANNEL = "900000000000000001";
const GUILD = "800000000000000001";
const SOCIAL_ROLE = "700000000000000001";
const CAREER_ROLE = "700000000000000002";

function submission(fields = {}) {
  return {
    _id: "s1",
    rsoName: "IUGA",
    eName: "IUGA Study Break",
    eStartDate: new Date("2026-12-01T18:00:00-08:00"),
    eEndDate: new Date("2026-12-01T20:00:00-08:00"),
    eLocation: "Mary Gates Hall",
    eDescription: "Snacks and a quiet room.",
    eLabels: ["Social", "Career"],
    interestRoleIds: [SOCIAL_ROLE, CAREER_ROLE],
    ...fields,
  };
}

function fakeClient({ failPost, failScheduledEvent, deleteErrors = {} } = {}) {
  const calls = [];
  return {
    calls,
    async postMessage(channelId, body) {
      calls.push({ method: "postMessage", channelId, body });
      if (failPost) throw Object.assign(new Error("announcement failed"), { likelyCause: failPost });
      return { id: "m1" };
    },
    async createScheduledEvent(guildId, body) {
      calls.push({ method: "createScheduledEvent", guildId, body });
      if (failScheduledEvent) throw new Error("scheduled event failed");
      return { id: "e1" };
    },
    async deleteMessage(channelId, messageId) {
      calls.push({ method: "deleteMessage", channelId, messageId });
      if (deleteErrors.deleteMessage) throw Object.assign(new Error("gone"), { discordCode: deleteErrors.deleteMessage });
    },
    async deleteScheduledEvent(guildId, eventId) {
      calls.push({ method: "deleteScheduledEvent", guildId, eventId });
      if (deleteErrors.deleteScheduledEvent) throw Object.assign(new Error("gone"), { discordCode: deleteErrors.deleteScheduledEvent });
    },
  };
}

function announcer(client, { channelId = CHANNEL } = {}) {
  return createEventAnnouncements({ client, channelId, guildId: GUILD, now: () => NOW });
}

describe("announce posts the announcement", () => {
  it("posts the event card to the configured channel and pings only the picked roles", async () => {
    const client = fakeClient();

    const result = await announcer(client).announce(submission());

    const post = client.calls.find((call) => call.method === "postMessage");
    assert.equal(post.channelId, CHANNEL);
    assert.equal(post.body.content, `<@&${SOCIAL_ROLE}> <@&${CAREER_ROLE}>`);
    assert.deepEqual(post.body.allowed_mentions, { roles: [SOCIAL_ROLE, CAREER_ROLE] });
    assert.equal(post.body.embeds[0].title, "IUGA Study Break");
    assert.equal(post.body.embeds[0].description, "Snacks and a quiet room.");
    assert.deepEqual(post.body.embeds[0].fields.map((field) => field.name), ["RSO", "Categories", "When", "Location"]);
    assert.equal(post.body.embeds[0].url, "https://iuga.info/events");
    assert.equal(result.announcementChannelId, CHANNEL);
    assert.equal(result.announcementMessageId, "m1");
  });

  it("sends no ping text when no roles were picked", async () => {
    const client = fakeClient();

    await announcer(client).announce(submission({ interestRoleIds: [] }));

    const post = client.calls.find((call) => call.method === "postMessage");
    assert.equal(post.body.content, undefined);
    assert.deepEqual(post.body.allowed_mentions, { roles: [] });
  });

  it("neutralizes mention tokens in the event text so it cannot ping anyone", async () => {
    const client = fakeClient();

    await announcer(client).announce(submission({ eDescription: "Come @everyone and <@&999> join" }));

    const post = client.calls.find((call) => call.method === "postMessage");
    assert.doesNotMatch(post.body.embeds[0].description, /@everyone/);
    assert.doesNotMatch(post.body.embeds[0].description, /<@&999>/);
  });

  it("skips the announcement when no channel is configured and still creates the Scheduled Event", async () => {
    const client = fakeClient();

    const result = await announcer(client, { channelId: "" }).announce(submission());

    assert.equal(client.calls.some((call) => call.method === "postMessage"), false);
    assert.equal(result.scheduledEventId, "e1");
    assert.deepEqual(result.problems, ["No announcement channel configured."]);
  });

  it("skips the announcement when it is already saved", async () => {
    const client = fakeClient();

    const result = await announcer(client).announce(
      submission({ announcementChannelId: CHANNEL, announcementMessageId: "m0" }),
    );

    assert.equal(client.calls.some((call) => call.method === "postMessage"), false);
    assert.equal(result.announcementMessageId, undefined);
  });
});

describe("announce creates the Scheduled Event", () => {
  it("creates an external event with the name, times, description, and location", async () => {
    const client = fakeClient();

    const result = await announcer(client).announce(submission());

    const create = client.calls.find((call) => call.method === "createScheduledEvent");
    assert.equal(create.guildId, GUILD);
    assert.deepEqual(create.body, {
      name: "IUGA Study Break",
      description: "Snacks and a quiet room.",
      entity_type: 3,
      privacy_level: 2,
      scheduled_start_time: "2026-12-02T02:00:00.000Z",
      scheduled_end_time: "2026-12-02T04:00:00.000Z",
      entity_metadata: { location: "Mary Gates Hall" },
    });
    assert.equal(result.scheduledEventId, "e1");
  });

  it("shortens a name and location longer than 100 characters", async () => {
    const client = fakeClient();
    const longText = "x".repeat(150);

    await announcer(client).announce(submission({ eName: longText, eLocation: longText }));

    const create = client.calls.find((call) => call.method === "createScheduledEvent");
    assert.equal(create.body.name.length, 100);
    assert.equal(create.body.entity_metadata.location.length, 100);
  });

  it("does not leave half of an emoji when cutting a long name or location to 100 characters", async () => {
    const client = fakeClient();
    const textCutMidEmoji = `${"x".repeat(99)}😀`;

    await announcer(client).announce(submission({ eName: textCutMidEmoji, eLocation: textCutMidEmoji }));

    const create = client.calls.find((call) => call.method === "createScheduledEvent");
    assert.equal(create.body.name, "x".repeat(99));
    assert.equal(create.body.entity_metadata.location, "x".repeat(99));
  });

  it("skips the Scheduled Event when there is no end time", async () => {
    const client = fakeClient();

    const result = await announcer(client).announce(submission({ eEndDate: undefined }));

    assert.equal(client.calls.some((call) => call.method === "createScheduledEvent"), false);
    assert.equal(result.scheduledEventId, undefined);
    assert.equal(result.announcementMessageId, "m1");
  });

  it("skips the Scheduled Event when the event has already started", async () => {
    const client = fakeClient();

    const result = await announcer(client).announce(submission({ eStartDate: new Date("2026-11-19T18:00:00-08:00") }));

    assert.equal(client.calls.some((call) => call.method === "createScheduledEvent"), false);
    assert.equal(result.scheduledEventId, undefined);
  });

  it("skips the Scheduled Event when it is already saved", async () => {
    const client = fakeClient();

    const result = await announcer(client).announce(submission({ scheduledEventId: "e0" }));

    assert.equal(client.calls.some((call) => call.method === "createScheduledEvent"), false);
    assert.equal(result.scheduledEventId, undefined);
  });
});

describe("announce reports a failed part without blocking the other", () => {
  it("still creates the Scheduled Event and names the likely cause when the post fails", async () => {
    const client = fakeClient({ failPost: "the bot is missing a permission in this channel" });

    const result = await announcer(client).announce(submission());

    assert.equal(result.scheduledEventId, "e1");
    assert.equal(result.announcementMessageId, undefined);
    assert.deepEqual(result.problems, [
      "Discord announcement failed: the bot is missing a permission in this channel.",
    ]);
  });

  it("still posts the announcement and reports the failure when the Scheduled Event fails", async () => {
    const client = fakeClient({ failScheduledEvent: true });

    const result = await announcer(client).announce(submission());

    assert.equal(result.announcementMessageId, "m1");
    assert.equal(result.scheduledEventId, undefined);
    assert.deepEqual(result.problems, ["Discord Scheduled Event failed."]);
  });
});

describe("withdraw removes both parts", () => {
  it("deletes the announcement and the Scheduled Event using the saved IDs", async () => {
    const client = fakeClient();

    await announcer(client).withdraw(
      submission({ announcementChannelId: CHANNEL, announcementMessageId: "m1", scheduledEventId: "e1" }),
    );

    assert.deepEqual(client.calls, [
      { method: "deleteMessage", channelId: CHANNEL, messageId: "m1" },
      { method: "deleteScheduledEvent", guildId: GUILD, eventId: "e1" },
    ]);
  });

  it("succeeds when Discord says the message or event is already gone", async () => {
    const client = fakeClient({ deleteErrors: { deleteMessage: 10008, deleteScheduledEvent: 10070 } });

    await assert.doesNotReject(
      announcer(client).withdraw(
        submission({ announcementChannelId: CHANNEL, announcementMessageId: "m1", scheduledEventId: "e1" }),
      ),
    );
  });

  it("still deletes the Scheduled Event when the announcement channel was deleted", async () => {
    const client = fakeClient({ deleteErrors: { deleteMessage: 10003 } });

    await announcer(client).withdraw(
      submission({ announcementChannelId: CHANNEL, announcementMessageId: "m1", scheduledEventId: "e1" }),
    );

    assert.equal(client.calls.some((call) => call.method === "deleteScheduledEvent"), true);
  });

  it("does nothing when neither part was saved", async () => {
    const client = fakeClient();

    await announcer(client).withdraw(submission());

    assert.deepEqual(client.calls, []);
  });

  it("passes any other Discord error back to the caller", async () => {
    const client = fakeClient({ deleteErrors: { deleteMessage: 50013 } });

    await assert.rejects(
      announcer(client).withdraw(submission({ announcementChannelId: CHANNEL, announcementMessageId: "m1" })),
      { discordCode: 50013 },
    );
  });
});
