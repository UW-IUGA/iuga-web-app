/*
Refer to the "IUGA Website Backend Doc" for more information.

Middlewares and helpers addressed in auth.js:
- requireAuth
- requirePermission
- permissionsOf
- isOwnerOrPermitted
- isKnownPermission

Purpose: Decide who may use protected endpoints. Signing in proves who a user
         is. Everything beyond that is a named permission, granted only by an
         active, unexpired assignment to an active role; the account type
         (uType) grants nothing. Permissions are read from the database on
         every check, so granting or removing a role takes effect on the
         user's next request without signing in again.
*/

import { sendError } from "../helpers/sendError.js";

// Every permission a role can grant. A role holding any other name grants nothing for it.
const knownPermissions = new Set([
  "users.roles.manage",
  "events.requests.manage",
  "events.leadership.approve",
  "events.finance.manage",
  "events.purchases.complete",
  "events.participants.manage",
  "feedback.manage",
  "shop.purchases.review",
]);

/*
    @helper: isKnownPermission
    @description: Whether `name` is a permission the site defines.
*/
export function isKnownPermission(name) {
  return knownPermissions.has(name);
}

function assertKnownPermission(name) {
  if (!isKnownPermission(name)) {
    throw new Error(`Unknown permission "${name}"`);
  }
}

/*
    @middleware: requireAuth
    @method: N/A (Express middleware)
    @description: Checks that the request comes from a logged-in user.
                  Any authenticated user passes; anonymous requests are
                  rejected before reaching the route handler.

    Expected Request Information:
    - req.session.isAuthenticated (set true at /user/login)

    Expected Response Information:
    - next() when authenticated (passes to the route handler)
    - 401 { status: "error", message: "Not authenticated" } when not logged in
*/
export function requireAuth(req, res, next) {
  if (!req.session.isAuthenticated) {
    return sendError(res, 401, "Not authenticated");
  }
  next();
}

/*
    @helper: permissionsOf
    @description: The permissions the session user holds right now.

    Expected Request Information:
    - req.session.isAuthenticated, req.session.userId
    - req.models.RoleAssignments

    Expected Return Information:
    - Promise<Set<string>> of known permission names; empty when signed out
      (without a database read). Database errors reject rather than grant access.
*/
export async function permissionsOf(req) {
  if (!req.session.isAuthenticated || !req.session.userId) {
    return new Set();
  }
  const assignments = await req.models.RoleAssignments.find({
    userId: req.session.userId,
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).populate("roleId");

  return new Set(
    assignments
      .filter((assignment) => assignment.roleId?.isActive)
      .flatMap((assignment) => assignment.roleId.permissions)
      .filter(isKnownPermission),
  );
}

/*
    @middleware: requirePermission
    @method: N/A (Express middleware factory)
    @description: Checks that the session user holds `permission`. Building the
                  check for a name the site does not define throws, so a typo
                  fails when routes load instead of silently refusing everyone.

    Expected Response Information:
    - next() when the user holds the permission
    - 401 { status: "error", message: "Not authenticated" } when not logged in
    - 403 { status: "error", message: "Not authorized" } without the permission
    - 500 when role assignments cannot be read

    Example: router.post("/roles", requirePermission("users.roles.manage"), handler)
*/
export function requirePermission(permission) {
  assertKnownPermission(permission);
  return async function (req, res, next) {
    if (!req.session.isAuthenticated) {
      return sendError(res, 401, "Not authenticated");
    }

    try {
      if (!(await permissionsOf(req)).has(permission)) {
        return sendError(res, 403, "Not authorized");
      }
      next();
    } catch (error) {
      console.error(error);
      return sendError(res, 500);
    }
  };
}

/*
    @helper: isOwnerOrPermitted
    @description: Whether the session user owns a record or holds `permission`
                  over records like it. The owner is allowed without a
                  database read; a record with no owner belongs to no one.

    Expected Return Information:
    - Promise<boolean>; database errors reject rather than grant access
*/
export async function isOwnerOrPermitted(req, ownerId, permission) {
  assertKnownPermission(permission);
  const sessionUserId = req.session.userId?.toString();
  if (ownerId != null && sessionUserId && ownerId.toString() === sessionUserId) {
    return true;
  }
  return (await permissionsOf(req)).has(permission);
}
