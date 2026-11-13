// Replaces every guild command for this application with the /event definition.
// Usage: DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node scripts/registerDiscordCommands.mjs

import { createDiscordClient } from "../discordClient.js";
import { EVENT_COMMAND } from "../discordCommandDefinition.js";

const required = ["DISCORD_APP_ID", "DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const client = createDiscordClient({ botToken: process.env.DISCORD_BOT_TOKEN });

try {
  const registered = await client.registerGuildCommands(
    process.env.DISCORD_APP_ID,
    process.env.DISCORD_GUILD_ID,
    [EVENT_COMMAND],
  );
  console.log(`Registered ${registered.length} guild command(s) in guild ${process.env.DISCORD_GUILD_ID}:`);
  for (const command of registered) {
    console.log(`- /${command.name} (id ${command.id})`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
