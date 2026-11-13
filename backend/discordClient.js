const DISCORD_API = "https://discord.com/api/v10";

/*
 * @behavior Call the Discord REST API as the bot. Errors name the route and status, never the token.
 * @param botToken — the bot token from the environment
 * @param fetchImpl — fetch to use; injected so tests never reach Discord
 */
export function createDiscordClient({ botToken, fetchImpl = fetch }) {
  async function call(method, path, body) {
    const response = await fetchImpl(`${DISCORD_API}${path}`, {
      method,
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Discord ${method} ${path} failed with status ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
  }

  return {
    postMessage(channelId, body) {
      return call("POST", `/channels/${channelId}/messages`, body);
    },
    registerGuildCommands(applicationId, guildId, commands) {
      return call("PUT", `/applications/${applicationId}/guilds/${guildId}/commands`, commands);
    },
    async sendDirectMessage(userId, body) {
      const channel = await call("POST", "/users/@me/channels", { recipient_id: userId });
      return call("POST", `/channels/${channel.id}/messages`, body);
    },
  };
}
