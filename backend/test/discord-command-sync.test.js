import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncDiscordCommands } from "../discordCommandSync.js";
import { DISCORD_COMMANDS } from "../discordCommandDefinition.js";

function quietLog() {
  const lines = { info: [], warn: [], error: [] };
  return {
    lines,
    info: (text) => lines.info.push(text),
    warn: (text) => lines.warn.push(text),
    error: (text) => lines.error.push(text),
  };
}

function fakeClient({ fails = false } = {}) {
  const calls = [];
  return {
    calls,
    async registerGuildCommands(applicationId, guildId, commands) {
      calls.push({ applicationId, guildId, commands });
      if (fails) throw new Error("Discord PUT failed with status 401");
      return commands.map((command, index) => ({ ...command, id: String(index + 1) }));
    },
  };
}

describe("syncDiscordCommands", () => {
  it("registers every bot command in the server and logs their names", async () => {
    const client = fakeClient();
    const log = quietLog();
    await syncDiscordCommands({ client, applicationId: "app-1", guildId: "guild-1", log });

    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].applicationId, "app-1");
    assert.equal(client.calls[0].guildId, "guild-1");
    assert.deepEqual(client.calls[0].commands, DISCORD_COMMANDS);
    assert.match(log.lines.info.join(" "), /\/event/);
    assert.match(log.lines.info.join(" "), /\/rso-verify/);
  });

  it("skips with a warning when the app or server id is missing", async () => {
    for (const ids of [{ guildId: "guild-1" }, { applicationId: "app-1" }]) {
      const client = fakeClient();
      const log = quietLog();
      await syncDiscordCommands({ client, ...ids, log });

      assert.equal(client.calls.length, 0);
      assert.match(log.lines.warn.join(" "), /DISCORD_APP_ID|DISCORD_GUILD_ID/);
    }
  });

  it("logs a Discord failure instead of throwing, so startup carries on", async () => {
    const log = quietLog();
    await syncDiscordCommands({ client: fakeClient({ fails: true }), applicationId: "app-1", guildId: "guild-1", log });

    assert.match(log.lines.error.join(" "), /status 401/);
  });
});
