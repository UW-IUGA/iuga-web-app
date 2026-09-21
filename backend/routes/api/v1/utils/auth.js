/*
Purpose: Gate routes by session state, so a protected endpoint is only reachable by the right kind
of user. These middlewares sit at the front of a route chain, as in
`router.post("/", requireAuth, handler)`.
Authentication/Authorization Requirements: None; each middleware is itself the check.
Expected Request Information: The session set at /user/login: isAuthenticated, isAdmin, and userId.
Expected Response Information: The request continues when the check passes; otherwise 401 when nobody
is signed in, or 403 when the signed-in user may not do this.
*/

import { sendError } from "../helpers/sendError.js";

/*
 * @behavior Let a signed-in user through, and stop anyone else before the route handler runs.
 * @param req — the Express request, read for req.session.isAuthenticated
 * @param res — the Express response
 * @param next — continues to the route handler when the visitor is signed in
 * @returns nothing; answers 401 when nobody is signed in
 */
export function requireAuth(req, res, next) {
  if (!req.session.isAuthenticated) {
    return sendError(res, 401, "Not authenticated");
  }
  next();
}

/*
 * @behavior Check whether the signed-in user is an administrator, or is the owner of the record
 *           being acted on.
 * @param req — the Express request, read for req.session.isAdmin and req.session.userId
 * @param targetUserId — the user id stored on the record being acted on; an ObjectId or a string
 * @returns true when the signed-in user is an admin, or their id matches targetUserId
 */
export function isOwnerOrAdmin(req, targetUserId) {
  return Boolean(
    req.session.isAdmin ||
    targetUserId?.toString() === req.session.userId?.toString(),
  );
}

/*
 * @behavior Let a signed-in administrator through. Identity is checked first, so a visitor who is
 *           not signed in is told 401 rather than 403.
 * @param req — the Express request, read for req.session.isAuthenticated and req.session.isAdmin
 * @param res — the Express response
 * @param next — continues to the route handler when the visitor is an administrator
 * @returns nothing; answers 401 when nobody is signed in, or 403 when the user is not an admin
 */
export function requireAdmin(req, res, next) {
  if (!req.session.isAuthenticated) {
    return sendError(res, 401, "Not authenticated");
  }
  if (!req.session.isAdmin) {
    return sendError(res, 403, "Not authorized");
  }
  next();
}

/*
 * @behavior Build a middleware that allows only an administrator whose active role assignment
 *           carries the named permission, as in
 *           `router.post("/roles", requireOfficerRolePermission("users.roles.manage"), handler)`.
 * @param permission — the permission the user's role must include
 * @returns the Express middleware
 * @exceptions nothing is thrown; a failed role lookup is logged and answered with 500
 */
export function requireOfficerRolePermission(permission) {
  return async function (req, res, next) {
    if (!req.session.isAuthenticated) {
      return sendError(res, 401, "Not authenticated");
    }
    if (!req.session.isAdmin) {
      return sendError(res, 403, "Not authorized");
    }

    try {
      const assignments = await req.models.RoleAssignments.find({
        userId: req.session.userId,
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      }).populate("roleId");

      const hasPermission = assignments.some(
        (assignment) =>
          assignment.roleId?.isActive &&
          assignment.roleId.permissions.includes(permission),
      );

      if (!hasPermission) {
        return sendError(res, 403, "Not authorized");
      }
      next();
    } catch (error) {
      console.error(error);
      return sendError(res, 500);
    }
  };
}
