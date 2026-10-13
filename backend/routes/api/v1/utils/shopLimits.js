/*
 * Purpose: Per-student limits for the shop: the default for every product, and each product's own limit
 *          when it has one. Limits are read from the database and kept in memory for a short window, so
 *          holds and the catalog do not query the database on every request.
 * Authentication/Authorization Requirements: N/A (server-side only).
 * Expected Request Information: req.models and the current time in milliseconds.
 * Expected Response Information: a limits snapshot { defaultLimit, perSku } and the limit for one product.
 *
 * A change made directly in the database applies once the window ends (SHOP_LIMIT_CACHE_SECONDS, 60 by
 * default). A change made through the app calls invalidateLimits(), so it applies at once.
 */

import { DEFAULT_PER_STUDENT_LIMIT } from "./shopHolds.js";

const DEFAULT_CACHE_SECONDS = 60;
const DEFAULT_LIMIT_KEY = "default";

/*
 * @behavior Converts SHOP_LIMIT_CACHE_SECONDS into the cache window. Unset means 60 seconds. 0 turns caching off,
 *           which tests use so a limit change is seen at once. A negative or non-numeric value fails startup.
 * @param rawSeconds — the environment value, or undefined
 * @returns cache window in milliseconds
 */
export function limitCacheMs(rawSeconds) {
  if (rawSeconds === undefined || rawSeconds === "") {
    return DEFAULT_CACHE_SECONDS * 1000;
  }
  const seconds = Number(rawSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new Error(`SHOP_LIMIT_CACHE_SECONDS must be 0 or more seconds, got "${rawSeconds}".`);
  }
  return seconds * 1000;
}

export const LIMIT_CACHE_MS = limitCacheMs(process.env.SHOP_LIMIT_CACHE_SECONDS);

let cache = null;
let generation = 0;

/*
 * @behavior The limits in effect now. Reads the database when the cached snapshot is missing or older than the
 *           window. A read that started before invalidateLimits() is not cached, so a change is never hidden.
 * @param models — database models with ShopLimitDefault and ShopProductLimits
 * @param nowMs — current time in milliseconds
 * @returns Promise<{ defaultLimit: number, perSku: Map<string, number> }>
 */
export async function currentLimits(models, nowMs = Date.now()) {
  if (cache && nowMs - cache.loadedAt < LIMIT_CACHE_MS) {
    return cache.limits;
  }
  const loadGeneration = generation;
  const [settings, products] = await Promise.all([
    models.ShopLimitDefault.findOne({ key: DEFAULT_LIMIT_KEY }, { _id: 0, perStudentLimit: 1 }).lean(),
    models.ShopProductLimits.find({}, { _id: 0, sku: 1, perStudentLimit: 1 }).lean(),
  ]);
  const limits = {
    defaultLimit: settings?.perStudentLimit ?? DEFAULT_PER_STUDENT_LIMIT,
    perSku: new Map(products.map((product) => [product.sku, product.perStudentLimit])),
  };
  if (loadGeneration === generation) {
    cache = { loadedAt: nowMs, limits };
  }
  return limits;
}

/*
 * @behavior Drops the cached limits so the next read goes to the database. Call after the app changes a limit.
 */
export function invalidateLimits() {
  generation += 1;
  cache = null;
}

/*
 * @behavior A product's limit: its own document when it has one, otherwise the default.
 * @param limits — a snapshot from currentLimits
 * @param sku — product SKU
 * @returns integer limit
 */
export function limitFor(limits, sku) {
  return limits.perSku.get(sku) ?? limits.defaultLimit;
}
