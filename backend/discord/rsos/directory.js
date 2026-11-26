import { cleanName, officerRoleName } from "../roles.js";
import { DISCORD_ERROR } from "../platform/client.js";

const NAME_LIMIT = 80;
const SUGGESTION_LIMIT = 25;
const ROLE_CACHE_MS = 60_000;
const DUPLICATE_KEY = 11000;
const LEAN = { lean: true };

function keyOf(name) {
  return name.toLowerCase();
}

const IUGA = { rsoKey: keyOf("IUGA"), rsoName: "IUGA" };

/*
 * @behavior Know which RSOs exist, who represents each one, and make someone a representative.
 *           An RSO's verified officers hold a "<RSO> Officer" role the directory creates with no
 *           permissions; the server's own RSO membership roles are never changed or handed out.
 *           Names match ignoring case and spacing. rsoKey is opaque: callers store and compare it,
 *           never build it.
 * @param models — provides DiscordRsos
 * @param client — Discord REST adapter with listRoles, createRole, addMemberRole, deleteRole
 * @param roles — server roles: the general RSO officer role, the IUGA officer role, and which roles are special
 * @param now — returns the current time in milliseconds
 */
export function createRsoDirectory({
  models,
  client,
  roles,
  now = () => Date.now(),
}) {
  const rsos = () => models.DiscordRsos;
  const roleCache = new Map();

  async function serverRoles(guildId, { fresh = false } = {}) {
    const cached = roleCache.get(guildId);
    if (!fresh && cached && now() - cached.at < ROLE_CACHE_MS) return cached.roles;
    const listed = await client.listRoles(guildId);
    roleCache.set(guildId, { at: now(), roles: listed });
    return listed;
  }

  async function membershipRoleNames(guildId) {
    const listed = await serverRoles(guildId);
    return listed.filter((role) => !roles.isSpecialRole(role, guildId)).map((role) => cleanName(role.name));
  }

  /*
   * @behavior Up to 25 RSO names containing the typed text, ignoring case and spacing: RSOs the bot
   *           knows plus the server's RSO membership roles. Empty when none.
   */
  async function suggest(text, guildId) {
    const typed = keyOf(cleanName(text));
    const known = await rsos().find({}, null, { ...LEAN, sort: { name: 1 } });
    const byKey = new Map();
    for (const name of [...known.map((rso) => rso.name), ...(await membershipRoleNames(guildId))]) {
      if (!byKey.has(keyOf(name))) byKey.set(keyOf(name), name);
    }
    return [...byKey.entries()]
      .filter(([key]) => key.includes(typed))
      .map(([, name]) => name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, SUGGESTION_LIMIT);
  }

  /*
   * @behavior The key and display name for a typed RSO, and whether it is new to the server. A known
   *           RSO or an RSO membership role keeps its existing spelling. Never writes.
   * @returns { rsoKey, name, isNew }, or null when the name is empty or longer than 80 characters
   */
  async function identify(typedName, guildId) {
    const name = cleanName(typedName);
    if (!name || name.length > NAME_LIMIT) return null;
    const rsoKey = keyOf(name);
    const existing = await rsos().findOne({ rsoKey }, null, LEAN);
    if (existing) return { rsoKey, name: existing.name, isNew: false };
    const role = (await membershipRoleNames(guildId)).find((roleName) => keyOf(roleName) === rsoKey);
    return { rsoKey, name: role ?? name, isNew: !role };
  }

  /*
   * @behavior The RSOs a guild member represents, from their RSO officer roles, plus IUGA for
   *           IUGA officers. Empty when none.
   */
  async function rsosOf(member) {
    const roleIds = Array.isArray(member?.roles) ? member.roles : [];
    if (roleIds.length === 0) return [];
    const found = await rsos().find({ discordRoleId: { $in: roleIds } }, null, LEAN);
    const represented = found.map((rso) => ({ rsoKey: rso.rsoKey, rsoName: rso.name }));
    if (!roles.iugaOfficerRoleId || !roleIds.includes(roles.iugaOfficerRoleId)) return represented;
    return [IUGA, ...represented.filter((rso) => rso.rsoKey !== IUGA.rsoKey)];
  }

  async function nameTaken(guildId, rsoKey, rsoName) {
    const officerKey = keyOf(officerRoleName(rsoName));
    const listed = await serverRoles(guildId, { fresh: true });
    return listed.some((role) => {
      const key = keyOf(cleanName(role.name));
      return key === officerKey || (key === rsoKey && roles.isSpecialRole(role, guildId));
    });
  }

  async function findOrCreateRso({ guildId, rsoKey, rsoName, grantedBy }) {
    const existing = await rsos().findOne({ rsoKey }, null, LEAN);
    if (existing) return { rso: existing, created: false };
    const name = cleanName(rsoName);
    if (await nameTaken(guildId, rsoKey, name)) return { nameTaken: true };
    try {
      const rso = await rsos().create({ name, rsoKey, createdByDiscordId: grantedBy });
      return { rso, created: true };
    } catch (error) {
      if (error?.code !== DUPLICATE_KEY) throw error;
      return { rso: await rsos().findOne({ rsoKey }, null, LEAN), created: false };
    }
  }

  // When two approvals create a role at once, the first stored role wins and the other is deleted.
  async function roleFor(guildId, rso) {
    if (rso.discordRoleId) return rso.discordRoleId;
    // Officer roles only mark who represents an RSO: no permissions, no pings, not listed separately.
    const role = await client.createRole(guildId, {
      name: officerRoleName(rso.name),
      permissions: "0",
      mentionable: false,
      hoist: false,
    });
    roleCache.delete(guildId);
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
      if (error?.discordCode !== DISCORD_ERROR.UNKNOWN_ROLE) throw error;
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
   * @behavior Make the user an officer of the RSO: create the RSO and its officer role if missing,
   *           then grant that role and the general officer role. Safe to retry and to race. Discord
   *           failures other than the three reasons below are thrown.
   * @returns { ok: true, rso: { rsoKey, rsoName }, created } where created is true when this call added the RSO,
   *          or { ok: false, reason: "name-taken" | "member-gone" | "bot-cannot-manage-roles" }
   */
  async function grantOfficer({ guildId, userId, rsoKey, rsoName, grantedBy }) {
    try {
      const found = await findOrCreateRso({ guildId, rsoKey, rsoName, grantedBy });
      if (found.nameTaken) return { ok: false, reason: "name-taken" };
      await addRsoRole(guildId, userId, found.rso);
      if (roles.officerRoleId) await client.addMemberRole(guildId, userId, roles.officerRoleId);
      return { ok: true, rso: { rsoKey: found.rso.rsoKey, rsoName: found.rso.name }, created: found.created };
    } catch (error) {
      if (error?.discordCode === DISCORD_ERROR.UNKNOWN_MEMBER) return { ok: false, reason: "member-gone" };
      if (error?.discordCode === DISCORD_ERROR.MISSING_PERMISSIONS) return { ok: false, reason: "bot-cannot-manage-roles" };
      throw error;
    }
  }

  return { suggest, identify, rsosOf, grantOfficer };
}
