import { sendError } from "../helpers/sendError.js";

const RATE_LIMIT_MESSAGE = "Too many requests, please try again later";

export function configureTrustedProxy(app) {
  app.set("trust proxy", 1);
}

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
