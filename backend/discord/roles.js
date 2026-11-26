import { neutralizeMentions } from "./platform/interactions.js";

const ADMINISTRATOR = 1n << 3n;
const OFFICER_SUFFIX = " Officer";

// Kick, Ban, Administrator, Manage Channels, Manage Server, Manage Messages, Manage Roles, Timeout.
// Mention Everyone is left out because Discord's default role permissions include it.
const STAFF_PERMISSIONS = [1n, 2n, 3n, 4n, 5n, 13n, 28n, 40n].reduce((bits, bit) => bits | (1n << bit), 0n);

function hasRole(member, roleId) {
  return Boolean(roleId) && Array.isArray(member?.roles) && member.roles.includes(roleId);
}

export function cleanName(text) {
  return neutralizeMentions(String(text ?? "").trim().replace(/\s+/g, " "));
}

export function officerRoleName(rsoName) {
  return `${rsoName}${OFFICER_SUFFIX}`;
}

/*
 * @behavior The one place that decides what a server role means to the bot: who may review requests,
 *           which roles are staff or officer roles, and which roles officers may ping with an event.
 * @param modRoleId — moderators, who review requests
 * @param iugaOfficerRoleId — IUGA board members, who review requests and represent IUGA
 * @param officerRoleId — the general RSO officer role granted with every RSO officer role
 */
export function createServerRoles({ modRoleId, iugaOfficerRoleId, officerRoleId }) {
  const configuredRoleIds = new Set([modRoleId, iugaOfficerRoleId, officerRoleId].filter(Boolean));

  // May approve or deny requests: moderators, IUGA officers, or Discord's Administrator permission.
  function canReview(member) {
    if (!member?.user) return false;
    if (hasRole(member, modRoleId) || hasRole(member, iugaOfficerRoleId)) return true;
    return (BigInt(member.permissions ?? 0) & ADMINISTRATOR) === ADMINISTRATOR;
  }

  // Marks staff, an officer, or something Discord manages, rather than a club or an interest:
  // @everyone, roles a bot or integration created, the configured roles, "<RSO> Officer" roles,
  // and any role with moderation or admin permissions.
  function isSpecialRole(role, guildId) {
    if (role.id === guildId || role.managed || configuredRoleIds.has(role.id)) return true;
    if (cleanName(role.name).endsWith(OFFICER_SUFFIX)) return true;
    return (BigInt(role.permissions ?? 0) & STAFF_PERMISSIONS) !== 0n;
  }

  // Officers may ping a role with an event when an admin turned on "Allow anyone to @mention this
  // role" and the role isn't special.
  function canBePinged(role, guildId) {
    return Boolean(role?.mentionable) && !isSpecialRole(role, guildId);
  }

  return { officerRoleId, iugaOfficerRoleId, canReview, isSpecialRole, canBePinged };
}
