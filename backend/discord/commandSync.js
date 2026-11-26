import { DISCORD_COMMANDS } from "./commandDefinition.js";

/*
 * @behavior Make the Discord server show the bot's current slash commands, replacing whatever it
 *           showed before. Never throws: a failure is logged so the caller can carry on.
 * @param client — Discord REST client with registerGuildCommands
 * @param applicationId — DISCORD_APP_ID
 * @param guildId — DISCORD_GUILD_ID, the IUGA server
 * @param log — where to report the outcome
 */
export async function syncDiscordCommands({ client, applicationId, guildId, log = console }) {
  if (!applicationId || !guildId) {
    log.warn("Discord commands not registered: DISCORD_APP_ID and DISCORD_GUILD_ID are both needed.");
    return;
  }
  try {
    const registered = await client.registerGuildCommands(applicationId, guildId, DISCORD_COMMANDS);
    log.info(`Discord commands registered: ${registered.map((command) => `/${command.name}`).join(", ")}`);
  } catch (error) {
    log.error(`Discord command registration failed: ${error.message}`);
  }
}
