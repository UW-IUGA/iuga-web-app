import { neutralizeMentions } from "./discordInteractions.js";

const NAME_LIMIT = 80;
const SUGGESTION_LIMIT = 25;
const DUPLICATE_KEY = 11000;
const UNKNOWN_ROLE = 10011;
const UNKNOWN_MEMBER = 10007;
const MISSING_PERMISSIONS = 50013;
const LEAN = { lean: true };

function cleanName(text) {
  return neutralizeMentions(String(text ?? "").trim().replace(/\s+/g, " "));
}

function keyOf(name) {
  return name.toLowerCase();
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/*
 * @behavior Know which RSOs exist, who represents each one, and make someone a representative.
 *           Every RSO role it creates has no permissions. Names match ignoring case and spacing.
 *           rsoKey is opaque: callers store and compare it, never build it.
 * @param models — provides DiscordRsos
 * @param client — Discord REST adapter with listRoles, createRole, addMemberRole, deleteRole
 * @param officerRoleId — the general RSO officer role granted with every RSO role
 */
export function createRsoDirectory({ models, client, officerRoleId }) {
  const rsos = () => models.DiscordRsos;

  /*
   * @behavior Up to 25 known RSO names containing the typed text, ignoring case and spacing. Empty when none.
   */
  async function suggest(text) {
    const key = keyOf(cleanName(text));
    const filter = key ? { rsoKey: { $regex: escapeRegex(key) } } : {};
    const found = await rsos().find(filter, null, { ...LEAN, sort: { name: 1 }, limit: SUGGESTION_LIMIT });
    return found.map((rso) => rso.name);
  }

  /*
   * @behavior The key and display name for a typed RSO, and whether it exists yet. Never writes.
   * @returns { rsoKey, name, isNew }, or null when the name is empty or longer than 80 characters
   */
  async function identify(typedName) {
    const name = cleanName(typedName);
    if (!name || name.length > NAME_LIMIT) return null;
    const rsoKey = keyOf(name);
    const existing = await rsos().findOne({ rsoKey }, null, LEAN);
    return { rsoKey, name: existing?.name ?? name, isNew: !existing };
  }

  /*
   * @behavior The RSOs a guild member represents, from the member's roles. Empty when none.
   */
  async function rsosOf(member) {
    const roleIds = Array.isArray(member?.roles) ? member.roles : [];
    if (roleIds.length === 0) return [];
    const found = await rsos().find({ discordRoleId: { $in: roleIds } }, null, LEAN);
    return found.map((rso) => ({ rsoKey: rso.rsoKey, rsoName: rso.name }));
  }

  async function nameTakenByServerRole(guildId, rsoKey) {
    const roles = await client.listRoles(guildId);
    return roles.some((role) => keyOf(cleanName(role.name)) === rsoKey);
  }

  async function findOrCreateRso({ guildId, rsoKey, rsoName, grantedBy }) {
    const existing = await rsos().findOne({ rsoKey }, null, LEAN);
    if (existing) return { rso: existing, created: false };
    if (await nameTakenByServerRole(guildId, rsoKey)) return { nameTaken: true };
    try {
      const rso = await rsos().create({ name: cleanName(rsoName), rsoKey, createdByDiscordId: grantedBy });
      return { rso, created: true };
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY) throw error;
      return { rso: await rsos().findOne({ rsoKey }, null, LEAN), created: false };
    }
  }

  // When two approvals create a role at once, the first stored role wins and the other is deleted.
  async function roleFor(guildId, rso) {
    if (rso.discordRoleId) return rso.discordRoleId;
    const role = await client.createRole(guildId, { name: rso.name });
    const stored = await rsos().findOneAndUpdate(
      { rsoKey: rso.rsoKey, discordRoleId: null },
      { $set: { discordRoleId: role.id } },
      { returnDocument: "after", ...LEAN },
    );
    if (stored) return role.id;
    await client.deleteRole(guildId, role.id).catch((error) => {
      console.error(`Duplicate RSO role cleanup failed: ${error.message}`);
    });
    const winner = await rsos().findOne({ rsoKey: rso.rsoKey }, null, LEAN);
    return winner.discordRoleId;
  }

  async function addRsoRole(guildId, userId, rso) {
    const roleId = await roleFor(guildId, rso);
    try {
      await client.addMemberRole(guildId, userId, roleId);
    } catch (error) {
      if (error?.discordCode !== UNKNOWN_ROLE) throw error;
      const cleared = await rsos().findOneAndUpdate(
        { rsoKey: rso.rsoKey, discordRoleId: roleId },
        { $set: { discordRoleId: null } },
        { returnDocument: "after", ...LEAN },
      );
      const fresh = cleared ?? (await rsos().findOne({ rsoKey: rso.rsoKey }, null, LEAN));
      await client.addMemberRole(guildId, userId, await roleFor(guildId, fresh));
    }
  }

  /*
   * @behavior Make the user an officer of the RSO: create the RSO and its role if missing, then grant
   *           the RSO role and the general officer role. Safe to retry and to race. Discord failures
   *           other than the three reasons below are thrown.
   * @returns { ok: true, rso: { rsoKey, rsoName }, created } where created is true when this call added the RSO,
   *          or { ok: false, reason: "name-taken" | "member-gone" | "bot-cannot-manage-roles" }
   */
  async function grantOfficer({ guildId, userId, rsoKey, rsoName, grantedBy }) {
    try {
      const found = await findOrCreateRso({ guildId, rsoKey, rsoName, grantedBy });
      if (found.nameTaken) return { ok: false, reason: "name-taken" };
      await addRsoRole(guildId, userId, found.rso);
      if (officerRoleId) await client.addMemberRole(guildId, userId, officerRoleId);
      return { ok: true, rso: { rsoKey: found.rso.rsoKey, rsoName: found.rso.name }, created: found.created };
    } catch (error) {
      if (error?.discordCode === UNKNOWN_MEMBER) return { ok: false, reason: "member-gone" };
      if (error?.discordCode === MISSING_PERMISSIONS) return { ok: false, reason: "bot-cannot-manage-roles" };
      throw error;
    }
  }

  return { suggest, identify, rsosOf, grantOfficer };
}
