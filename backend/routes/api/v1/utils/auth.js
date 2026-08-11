/*
Refer to the "IUGA Website Backend Doc" for more information.

Middlewares addressed in auth.js:
- requireAuth
- requireAdmin

Purpose: Gate routes by session state so protected endpoints are only
         reachable by the right kind of user. Used in the route chain,
         e.g. router.post("/", requireAuth, handler).
*/

import { sendError } from "../helpers/sendError.js";

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
    @middleware: requireAdmin
    @method: N/A (Express middleware)
    @description: Checks that the request comes from a logged-in officer.
                  Identity first (401), then permission (403).


    Expected Request Information:
    - req.session.isAuthenticated (set true at /user/login)
    - req.session.isAdmin (set at /user/login from uType === "Admin")

    Expected Response Information:
    - next() when admin (passes to the route handler)
    - 401 { status: "error", message: "Not authenticated" } when not logged in
    - 403 { status: "error", message: "Not authorized" } when logged in but not admin
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
