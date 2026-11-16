const ADMINISTRATOR = 1n << 3n;

function hasRole(member, roleId) {
  return Boolean(roleId) && Array.isArray(member?.roles) && member.roles.includes(roleId);
}

/*
 * @behavior Decide whether a guild member may approve or deny Discord requests: the moderator role,
 *           the IUGA officer role, or Discord's Administrator permission.
 * @param config — { modRoleId, iugaOfficerRoleId }
 */
export function canReview(member, { modRoleId, iugaOfficerRoleId }) {
  if (!member?.user) return false;
  if (hasRole(member, modRoleId) || hasRole(member, iugaOfficerRoleId)) return true;
  return (BigInt(member.permissions ?? 0) & ADMINISTRATOR) === ADMINISTRATOR;
}
