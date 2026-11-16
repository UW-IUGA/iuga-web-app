/*
 * @behavior Build a lookup from a Discord user ID to the RSO that user may submit for.
 * @param entries — object mapping Discord user IDs to { rsoKey, rsoName }
 * @returns { resolveRso(discordUserId) } returning { rsoKey, rsoName } or null
 */
export function createRsoRegistry(entries) {
  const byUser = new Map(Object.entries(entries));
  return {
    resolveRso(discordUserId) {
      return byUser.get(String(discordUserId)) ?? null;
    },
  };
}

/*
 * @behavior Read the officer registry from the DISCORD_RSO_OFFICERS value, a JSON object keyed by
 *           Discord user ID. Unset means no officers. Malformed input stops startup rather than
 *           silently allowing no one, so a bad deploy is visible immediately.
 * @param value — the raw environment string, or undefined
 */
export function rsoRegistryFromEnv(value) {
  if (!value || !value.trim()) return createRsoRegistry({});

  let entries;
  try {
    entries = JSON.parse(value);
  } catch {
    throw new Error("DISCORD_RSO_OFFICERS must be valid JSON");
  }
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new Error("DISCORD_RSO_OFFICERS must be a JSON object keyed by Discord user ID");
  }
  for (const [userId, entry] of Object.entries(entries)) {
    if (typeof entry?.rsoKey !== "string" || !entry.rsoKey) {
      throw new Error(`DISCORD_RSO_OFFICERS entry ${userId} needs a non-empty rsoKey`);
    }
    if (typeof entry?.rsoName !== "string" || !entry.rsoName) {
      throw new Error(`DISCORD_RSO_OFFICERS entry ${userId} needs a non-empty rsoName`);
    }
  }
  return createRsoRegistry(entries);
}
