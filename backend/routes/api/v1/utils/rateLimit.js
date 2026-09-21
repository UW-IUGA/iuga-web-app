/*
Purpose: Keep one client from flooding the API, and tell Express to read the client address from
the proxy that sits in front of it.
Authentication/Authorization Requirements: None; the limiter is itself a protection for the
endpoints that do require a session.
Expected Request Information: Every request that passes through the limiter, plus the limit, window,
and client capacity chosen by the app.
Expected Response Information: A request inside the limit continues; a client over the limit receives
429 with a Retry-After header and the standard error envelope.
*/

import { sendError } from "../helpers/sendError.js";

const RATE_LIMIT_MESSAGE = "Too many requests, please try again later";

export function configureTrustedProxy(app) {
  app.set("trust proxy", 1);
}

/*
 * @behavior Build a middleware that counts each client address's requests inside a moving window
 *           and refuses a client that goes over the limit.
 * @param options.limit — how many requests one client may make inside the window
 * @param options.windowMs — the length of the window in milliseconds
 * @param options.maxClients — how many different clients are tracked at once; when the map is
 *                             full the oldest client is forgotten, so memory stays bounded
 * @returns the Express middleware
 * @exceptions TypeError when limit, windowMs, or maxClients is not a positive whole number
 */
export function createRateLimiter({ limit, windowMs, maxClients = 10_000 }) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("Rate-limit limit must be a positive integer");
  }
  if (!Number.isInteger(windowMs) || windowMs < 1) {
    throw new TypeError("Rate-limit window must be a positive integer");
  }
  if (!Number.isInteger(maxClients) || maxClients < 1) {
    throw new TypeError("Rate-limit capacity must be a positive integer");
  }

  const clients = new Map();
  let lastPrunedAt = 0;

  /*
   * @behavior Count this request against the client's window. Clients that have gone quiet are
   *           swept out once per window, so no timer is needed to forget them.
   * @param req — the Express request; its client address is the key
   * @param res — the Express response, for the Retry-After header
   * @param next — continues to the route when the request is inside the limit
   * @returns nothing; answers 429 when the client has gone over the limit
   */
  return function rateLimiter(req, res, next) {
    const now = Date.now();
    if (now - lastPrunedAt >= windowMs) {
      for (const [key, entry] of clients) {
        if (now - entry.startedAt >= windowMs) clients.delete(key);
      }
      lastPrunedAt = now;
    }

    const key = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const current = clients.get(key);
    if (!current && clients.size >= maxClients) {
      const oldestKey = clients.keys().next().value;
      if (oldestKey !== undefined) clients.delete(oldestKey);
    }

    const entry =
      current && now - current.startedAt < windowMs
        ? current
        : { count: 0, startedAt: now };

    entry.count += 1;
    clients.set(key, entry);

    if (entry.count > limit) {
      const retryAfter = Math.max(
        1,
        Math.ceil((entry.startedAt + windowMs - now) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfter));
      return sendError(res, 429, RATE_LIMIT_MESSAGE);
    }

    next();
  };
}
