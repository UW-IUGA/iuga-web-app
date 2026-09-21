/*
* Purpose: Turn the failures raised by middleware and routes into the API's error response shape,
* without leaking server detail to the client.
* Authentication/Authorization Requirements: None; the error handler runs last for every request.
* Expected Request Information: An error raised by an earlier middleware or route.
* Expected Response Information: The API error envelope with 400, 403, 413, or 500. Server detail is
* logged, never returned.
*/

import { sendError } from "../routes/api/v1/helpers/sendError.js";

/*
 * @behavior Convert parser and unexpected Express errors into the API error envelope.
 * @param error — the failure raised by an earlier middleware or route
 * @returns a stable client response without exposing server details
 */
export function httpErrorHandler(error, _req, res, _next) {
  if (error?.type === "entity.too.large" || error?.status === 413) {
    return sendError(res, 413, "Request body is too large");
  }
  if (error instanceof SyntaxError && error.status === 400) {
    return sendError(res, 400, "Malformed JSON request body");
  }
  if (error?.message === "CORS origin not allowed") {
    return sendError(res, 403, "Origin is not allowed");
  }

  console.error("Unhandled HTTP error:", error?.message ?? "unknown error");
  return sendError(res, 500);
}

/*
 * @behavior Convert SPA delivery failures into a generic API error response.
 * @param res — the Express response to complete
 * @param error — the delivery failure to log without exposing to the client
 * @returns the completed generic server-error response
 */
export function sendSpaError(res, error) {
  console.error("SPA delivery failed:", error?.message ?? "unknown error");
  return sendError(res, 500);
}
