import { COMPONENT_ACTION_ROW, COMPONENT_ROLE_SELECT } from "../platform/interactions.js";

export const AUDIENCE_ACTION = "event-audience";
export const AUDIENCE_PICK_LIMIT = 3;

/*
 * @behavior Keep only the roles an officer may ping with an event: roles a server admin has marked
 *           "Allow anyone to @mention this role", never @everyone, bot-managed roles, or staff roles.
 *           Admins control the audience list from Discord's role settings, with no bot config.
 * @param picked — role ids chosen in the picker; untrusted
 * @param resolvedRoles — the interaction's resolved role objects, keyed by role id
 * @param rules — { guildId, blockedRoleIds }
 * @returns { roleIds, refused } where refused names each picked role that can't be pinged
 */
export function allowedAudience(picked, resolvedRoles, { guildId, blockedRoleIds = [] }) {
  const blocked = new Set([guildId, ...blockedRoleIds].filter(Boolean));
  const roleIds = [];
  const refused = [];
  for (const id of picked.map(String).slice(0, AUDIENCE_PICK_LIMIT)) {
    const role = resolvedRoles?.[id];
    if (role?.mentionable && !role.managed && !blocked.has(id)) roleIds.push(id);
    else refused.push(role?.name ?? "Unknown role");
  }
  return { roleIds, refused };
}

export function audiencePicker(draftId, roleIds) {
  return [
    {
      type: COMPONENT_ACTION_ROW,
      components: [
        {
          type: COMPONENT_ROLE_SELECT,
          custom_id: `${AUDIENCE_ACTION}:${draftId}`,
          placeholder: `Notify interest roles (optional, up to ${AUDIENCE_PICK_LIMIT})`,
          min_values: 0,
          max_values: AUDIENCE_PICK_LIMIT,
          default_values: roleIds.map((id) => ({ id, type: "role" })),
        },
      ],
    },
  ];
}

// Role mentions inside an embed never ping, so reviewers can see the audience safely.
export function audienceField(roleIds = []) {
  const value = roleIds.length ? roleIds.map((id) => `<@&${id}>`).join(" ") : "No role pings";
  return { name: "Notifies", value };
}
