import { sendError } from "../helpers/sendError.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_ERROR_MESSAGE = "CSRF validation failed";

/*
 * @behavior Reject authenticated state-changing requests without a trusted browser origin.
 * @param allowedOrigins — browser origins permitted to send cookie-authenticated mutations
 * @returns Express middleware that continues trusted requests and returns 403 otherwise
 */
export function createCsrfProtection({ allowedOrigins }) {
  const trustedOrigins = new Set(allowedOrigins);

  return function csrfProtection(req, res, next) {
    if (
      SAFE_METHODS.has(req.method) ||
      !req.session?.isAuthenticated
    ) {
      return next();
    }

    const origin = req.headers.origin;
    if (!origin || !trustedOrigins.has(origin)) {
      return sendError(res, 403, CSRF_ERROR_MESSAGE);
    }

    next();
  };
}
