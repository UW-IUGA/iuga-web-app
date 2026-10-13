import { sendError } from "../helpers/sendError.js";

const RATE_LIMIT_MESSAGE = "Too many requests, please try again later";

function networkAddress(req) {
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/*
 * @behavior Limits a signed-in student by their account and everyone else by network address, so
 *           students who share one address, such as campus Wi-Fi, do not use up each other's requests.
 * @param signedIn — limiter for requests with a signed-in session, keyed by user id
 * @param anonymous — limiter for all other requests, keyed by network address
 */
export function createApiRateLimiter({ signedIn, anonymous }) {
  const signedInLimiter = createRateLimiter({ ...signedIn, keyFor: (req) => String(req.session.userId) });
  const anonymousLimiter = createRateLimiter(anonymous);
  return function apiRateLimiter(req, res, next) {
    const limiter = req.session?.isAuthenticated && req.session.userId ? signedInLimiter : anonymousLimiter;
    return limiter(req, res, next);
  };
}

export function configureTrustedProxy(app) {
  app.set("trust proxy", 1);
}

/*
 * @behavior Counts requests per client in a fixed window and answers 429 past the limit.
 * @param limit — requests allowed per client per window
 * @param windowMs — window length in milliseconds
 * @param maxClients — most clients remembered at once; the oldest is dropped when full
 * @param keyFor — names the client a request counts against; defaults to the network address
 */
export function createRateLimiter({ limit, windowMs, maxClients = 10_000, keyFor = networkAddress }) {
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

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    if (now - lastPrunedAt >= windowMs) {
      for (const [key, entry] of clients) {
        if (now - entry.startedAt >= windowMs) clients.delete(key);
      }
      lastPrunedAt = now;
    }

    const key = keyFor(req);
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
