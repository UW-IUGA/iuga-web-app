export async function getEffectivePermissions(req) {
  const assignments = await req.models.RoleAssignments.find({
    userId: req.session.userId,
    isActive: true,
  }).populate("roleId");

  const now = Date.now();
  return [
    ...new Set(
      assignments.flatMap((assignment) => {
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
}
