const DISCORD_API = "https://discord.com/api/v10";
const MAX_NON_JSON_EXCERPT_LENGTH = 200;

const LIKELY_CAUSE_BY_DISCORD_CODE = {
  10003: "the channel ID is wrong or the channel was deleted",
  50001: "the bot is not in the server or cannot view this channel",
  50007: "the user does not accept direct messages from the bot",
  50013: "the bot is missing a permission in this channel, such as Send Messages or Embed Links",
};
const LIKELY_CAUSE_UNAUTHORIZED = "the bot token is invalid";

/*
 * @behavior Turn Discord's validation tree into "path CODE" entries, e.g. "embeds.0.title BASE_TYPE_MAX_LENGTH".
 *   Keeps only paths and error codes, so submitted values never reach the logs.
 */
function invalidFieldEntries(errors, path = []) {
  if (!errors || typeof errors !== "object") return [];
  return Object.entries(errors).flatMap(([key, value]) => {
    if (key !== "_errors") return invalidFieldEntries(value, [...path, key]);
    const codes = Array.isArray(value) ? value.map((error) => error?.code).filter(Boolean) : [];
    return codes.length ? [`${path.join(".")} ${codes.join(",")}`] : [];
  });
}

function nonJsonExcerpt(text) {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > MAX_NON_JSON_EXCERPT_LENGTH
    ? `${singleLine.slice(0, MAX_NON_JSON_EXCERPT_LENGTH)}…`
    : singleLine;
}

/*
 * @behavior Describe a failed Discord call for operators: route, status, Discord's code and message,
 *   a likely cause when the code is well known, and any invalid fields. Never includes the token.
 */
async function describeFailure(method, path, response) {
  const summary = `Discord ${method} ${path} failed with status ${response.status}`;
  const text = await response.text().catch(() => "");

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    const excerpt = nonJsonExcerpt(text);
    return excerpt ? `${summary}: ${excerpt}` : summary;
  }

  const hasDiscordCode = typeof body?.code === "number";
  const discordReason = hasDiscordCode ? `, code ${body.code} ${JSON.stringify(String(body.message ?? ""))}` : "";
  const sentences = [`${summary}${discordReason}`];
  const likelyCause =
    response.status === 401 ? LIKELY_CAUSE_UNAUTHORIZED : LIKELY_CAUSE_BY_DISCORD_CODE[body?.code];
  if (likelyCause) sentences.push(`Likely cause: ${likelyCause}`);
  const invalidFields = invalidFieldEntries(body?.errors);
  if (invalidFields.length) sentences.push(`Invalid fields: ${invalidFields.join("; ")}`);
  return sentences.join(". ");
}

/*
 * @behavior Call the Discord REST API as the bot. Errors name the route, status, and Discord's reason, never the token.
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
      throw new Error(await describeFailure(method, path, response));
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
