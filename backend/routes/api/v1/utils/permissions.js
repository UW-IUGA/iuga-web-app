import { ADMIN_PREVIEW_PERMISSIONS } from "./permissionCatalog.js";

export function isAdminPreviewEnabled() {
  return process.env.DEPLOY_ENV === "development" && process.env.ADMIN_PREVIEW === "true";
}

export async function getActiveCycle(req, now = new Date()) {
  if (typeof req.models?.Cycles?.findOne !== "function") return null;

  return req.models.Cycles.findOne({
    status: "active",
    startsAt: { $lte: now },
    endsAt: { $gt: now },
  }).lean();
}

export async function getEffectiveAuthorization(req) {
  if (typeof req.models?.Cycles?.findOne !== "function") {
    return { cycle: null, permissions: [] };
  }

  const cycle = await getActiveCycle(req);
  if (isAdminPreviewEnabled()) {
    return { cycle, permissions: [...ADMIN_PREVIEW_PERMISSIONS] };
  }
  if (!cycle) return { cycle: null, permissions: [] };

  const assignmentFilter = {
    userId: req.session.userId,
    isActive: true,
  };
  assignmentFilter.cycleId = cycle._id;
  const assignments = await req.models.RoleAssignments.find(assignmentFilter).populate("roleId");

  const now = Date.now();
  const permissions = [
    ...new Set(
      assignments.flatMap((assignment) => {
        if (
          assignment.cycleId !== undefined &&
          String(assignment.cycleId) !== String(cycle._id)
        ) {
          return [];
        }

        const role = assignment.roleId;
        const expiresAt = assignment.expiresAt
          ? new Date(assignment.expiresAt).getTime()
          : null;
        const isExpired = expiresAt !== null && expiresAt <= now;

        return role?.isActive && !isExpired && Array.isArray(role.permissions)
          ? role.permissions
          : [];
      }),
    ),
  ];

  return { cycle, permissions };
}

export async function getEffectivePermissions(req) {
  return (await getEffectiveAuthorization(req)).permissions;
}
