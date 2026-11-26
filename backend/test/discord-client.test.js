import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDiscordClient } from "../discord/platform/client.js";

const BOT_TOKEN = "test-bot-token";

async function errorMessageFromFailedPost(status, bodyText) {
  const fetchImpl = async () => new Response(bodyText, { status });
  const client = createDiscordClient({ botToken: BOT_TOKEN, fetchImpl });
  const error = await client.postMessage("123", { content: "hi" }).catch((caught) => caught);
  assert.ok(error instanceof Error, "expected the call to reject");
  return error.message;
}

describe("deferred Discord approvals", () => {
  const interaction = { application_id: "123", token: "private-interaction-token" };

  it("edits the approval card on success and sends refusals privately", async () => {
    const calls = [];
    const client = createDiscordClient({ botToken: BOT_TOKEN, fetchImpl: async (url, request) => {
      calls.push({ url, method: request.method, data: JSON.parse(request.body), headers: request.headers });
      return new Response(null, { status: 204 });
    } });
    await client.completeDeferredInteraction(interaction, { type: 7, data: { components: [] } });
    await client.completeDeferredInteraction(interaction, { type: 4, data: { content: "Already reviewed", flags: 64 } });

    const webhook = `https://discord.com/api/v10/webhooks/123/${interaction.token}`;
    assert.deepEqual(calls.map(({ url, method, data }) => ({ url, method, data })), [
      { url: `${webhook}/messages/@original`, method: "PATCH", data: { components: [] } },
      { url: webhook, method: "POST", data: { content: "Already reviewed", flags: 64 } },
    ]);
    assert.ok(calls.every(({ headers }) => !new Headers(headers).has("Authorization")));
  });

  it("does not expose the interaction token when delivery fails", async () => {
    const client = createDiscordClient({ botToken: BOT_TOKEN, fetchImpl: async () => new Response(interaction.token, { status: 404 }) });
    await assert.rejects(client.completeDeferredInteraction(interaction, { type: 7, data: {} }), (error) => {
      assert.match(error.message, /404/);
      assert.doesNotMatch(error.message, /private-interaction-token/);
      return true;
    });
  });
});

describe("Discord client errors", () => {
  it("names the route, status, Discord code, and Discord message", async () => {
    const message = await errorMessageFromFailedPost(403, JSON.stringify({ message: "Missing Access", code: 50001 }));

    assert.match(message, /POST \/channels\/123\/messages failed with status 403/);
    assert.match(message, /code 50001 "Missing Access"/);
  });

  for (const [status, code, cause] of [
    [403, 50001, /bot is not in the server or cannot view this channel/],
    [403, 50013, /bot is missing a permission/],
    [404, 10003, /channel ID is wrong/],
    [403, 50007, /does not accept direct messages/],
  ]) {
    it(`suggests a likely cause for Discord code ${code}`, async () => {
      const message = await errorMessageFromFailedPost(status, JSON.stringify({ message: "x", code }));

      assert.match(message, cause);
    });
  }

  it("exposes the likely cause on the error for callers to show", async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ message: "Missing Access", code: 50001 }), { status: 403 });
    const client = createDiscordClient({ botToken: BOT_TOKEN, fetchImpl });

    const error = await client.postMessage("123", { content: "hi" }).catch((caught) => caught);

    assert.match(error.likelyCause, /bot is not in the server or cannot view this channel/);
  });

  it("suggests checking the bot token on a 401", async () => {
    const message = await errorMessageFromFailedPost(401, JSON.stringify({ message: "401: Unauthorized", code: 0 }));

    assert.match(message, /bot token is invalid/);
  });

  it("gives no cause for a code it does not recognize", async () => {
    const message = await errorMessageFromFailedPost(400, JSON.stringify({ message: "Something new", code: 99999 }));

    assert.doesNotMatch(message, /Likely cause/);
  });

  it("lists every invalid field by path and error code", async () => {
    const body = JSON.stringify({
      code: 50035,
      message: "Invalid Form Body",
      errors: {
        embeds: { 0: { title: { _errors: [{ code: "BASE_TYPE_MAX_LENGTH", message: "Must be 256 or fewer in length." }] } } },
        content: { _errors: [{ code: "BASE_TYPE_REQUIRED", message: "This field is required" }] },
      },
    });

    const message = await errorMessageFromFailedPost(400, body);

    assert.match(message, /embeds\.0\.title BASE_TYPE_MAX_LENGTH/);
    assert.match(message, /content BASE_TYPE_REQUIRED/);
  });

  it("leaves out unexpected fields that could echo submitted values", async () => {
    const body = JSON.stringify({ code: 50035, message: "Invalid Form Body", echoed: "student event description" });

    const message = await errorMessageFromFailedPost(400, body);

    assert.doesNotMatch(message, /student event description/);
  });

  it("shortens a non-JSON body to an excerpt", async () => {
    const message = await errorMessageFromFailedPost(502, `<html>${"x".repeat(5000)}</html>`);

    assert.match(message, /status 502/);
    assert.match(message, /…$/);
    assert.doesNotMatch(message, /<\/html>/);
  });

  it("reports only the status when the body is empty", async () => {
    const message = await errorMessageFromFailedPost(500, "");

    assert.match(message, /failed with status 500$/);
  });

  it("never includes the bot token", async () => {
    const message = await errorMessageFromFailedPost(401, JSON.stringify({ message: "401: Unauthorized", code: 0 }));

    assert.doesNotMatch(message, new RegExp(BOT_TOKEN));
  });
});

function recordingClient(responses = []) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
    const next = responses.shift() ?? { status: 204 };
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status });
  };
  return { requests, client: createDiscordClient({ botToken: BOT_TOKEN, fetchImpl }) };
}

describe("Discord client roles", () => {
  it("creates a role with the settings it is given", async () => {
    const { requests, client } = recordingClient([{ status: 200, body: { id: "r1", name: "HCI Club" } }]);

    const role = await client.createRole("g1", { name: "HCI Club", permissions: "0", mentionable: false, hoist: false });

    assert.equal(role.id, "r1");
    assert.equal(requests[0].method, "POST");
    assert.match(requests[0].url, /\/guilds\/g1\/roles$/);
    assert.deepEqual(requests[0].body, { name: "HCI Club", permissions: "0", mentionable: false, hoist: false });
  });

  it("lists, assigns, and deletes roles on the guild routes", async () => {
    const { requests, client } = recordingClient([{ status: 200, body: [{ id: "r1", name: "Mods" }] }]);

    assert.deepEqual(await client.listRoles("g1"), [{ id: "r1", name: "Mods" }]);
    await client.addMemberRole("g1", "u1", "r1");
    await client.deleteRole("g1", "r1");

    assert.deepEqual(
      requests.map(({ method, url }) => `${method} ${url.replace(/^.*\/api\/v10/, "")}`),
      ["GET /guilds/g1/roles", "PUT /guilds/g1/members/u1/roles/r1", "DELETE /guilds/g1/roles/r1"],
    );
  });

  it("exposes Discord's error code on a failed call", async () => {
    const { client } = recordingClient([{ status: 404, body: { message: "Unknown Member", code: 10007 } }]);

    const error = await client.addMemberRole("g1", "u1", "r1").catch((caught) => caught);

    assert.equal(error.discordCode, 10007);
  });
});

describe("Discord client scheduled events and messages", () => {
  it("creates a scheduled event in the guild and returns Discord's event", async () => {
    const { requests, client } = recordingClient([{ status: 200, body: { id: "e1" } }]);
    const body = {
      name: "Hack Night",
      entity_type: 3,
      privacy_level: 2,
      scheduled_start_time: "2026-12-01T18:00:00-08:00",
      scheduled_end_time: "2026-12-01T20:00:00-08:00",
      entity_metadata: { location: "Gates 101" },
    };

    const event = await client.createScheduledEvent("g1", body);

    assert.equal(event.id, "e1");
    assert.equal(requests[0].method, "POST");
    assert.match(requests[0].url, /\/guilds\/g1\/scheduled-events$/);
    assert.deepEqual(requests[0].body, body);
  });

  it("deletes a scheduled event and a message on their routes", async () => {
    const { requests, client } = recordingClient();

    await client.deleteScheduledEvent("g1", "e1");
    await client.deleteMessage("c1", "m1");

    assert.deepEqual(
      requests.map(({ method, url }) => `${method} ${url.replace(/^.*\/api\/v10/, "")}`),
      ["DELETE /guilds/g1/scheduled-events/e1", "DELETE /channels/c1/messages/m1"],
    );
  });
});
