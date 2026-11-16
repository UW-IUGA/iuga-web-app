import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDiscordClient } from "../discordClient.js";

const BOT_TOKEN = "test-bot-token";

async function errorMessageFromFailedPost(status, bodyText) {
  const fetchImpl = async () => new Response(bodyText, { status });
  const client = createDiscordClient({ botToken: BOT_TOKEN, fetchImpl });
  const error = await client.postMessage("123", { content: "hi" }).catch((caught) => caught);
  assert.ok(error instanceof Error, "expected the call to reject");
  return error.message;
}

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
