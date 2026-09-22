/*
Purpose: Define the merchandise catalog for IUGA apparel drops and provide pure
         helpers for sale state calculation, public catalog projection, cart validation,
         and checkout session expiration.

Authentication/Authorization Requirements: N/A (pure utility module, not a route)

Expected Request Information: N/A
Expected Response Information: N/A

Note on Pricing & Sale Window:
Prices and the sale window dates defined in this catalog are placeholders pending
final confirmation by the product owner. This module is the single source of truth
for pricing and allowed sizes; callers must never re-derive or accept client-supplied prices.
*/

export const shopCatalog = Object.freeze({
  dropId: "fall-2026",
  catalogVersion: "fall-2026-v1",
  currency: "usd",
  opensAt: "2026-09-01T00:00:00.000Z",
  closesAt: "2026-12-01T00:00:00.000Z",
  items: Object.freeze([
    Object.freeze({
      sku: "info-hoodie",
      name: "INFO Hoodie",
      sizes: Object.freeze(["S", "M", "L", "XL", "2XL"]),
      unitAmount: 4500,
    }),
    Object.freeze({
      sku: "info-pullover",
      name: "INFO Pullover",
      sizes: Object.freeze(["S", "M", "L", "XL", "2XL"]),
      unitAmount: 4000,
    }),
    Object.freeze({
      sku: "info-baseball-tee",
      name: "INFO Baseball Tee",
      sizes: Object.freeze(["S", "M", "L", "XL", "2XL"]),
      unitAmount: 3000,
    }),
    Object.freeze({
      sku: "info-simple-tee",
      name: "INFO Simple Tee",
      sizes: Object.freeze(["S", "M", "L", "XL", "2XL"]),
      unitAmount: 2500,
    }),
    Object.freeze({
      sku: "info-tote-bag",
      name: "INFO Tote Bag",
      sizes: Object.freeze(["One Size"]),
      unitAmount: 2000,
    }),
  ]),
});

/*
 * @behavior Determine whether the catalog sale window is scheduled, open, or closed.
 * @param catalog — catalog definition containing opensAt and closesAt ISO date strings
 * @param nowMs — current timestamp in milliseconds
 * @returns "scheduled" | "open" | "closed"
 */
export function saleStateAt(catalog, nowMs) {
  const opensAt = Date.parse(catalog.opensAt);
  const closesAt = Date.parse(catalog.closesAt);
  if (nowMs < opensAt) {
    return "scheduled";
  }
  if (nowMs >= closesAt) {
    return "closed";
  }
  return "open";
}

/*
 * @behavior Project the catalog into its public representation including current sale state.
 * @param catalog — catalog definition
 * @param nowMs — current timestamp in milliseconds
 * @returns public catalog object with dropId, catalogVersion, currency, opensAt, closesAt, saleState, and items
 */
export function publicCatalog(catalog, nowMs) {
  return {
    dropId: catalog.dropId,
    catalogVersion: catalog.catalogVersion,
    currency: catalog.currency,
    opensAt: catalog.opensAt,
    closesAt: catalog.closesAt,
    saleState: saleStateAt(catalog, nowMs),
    items: catalog.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      sizes: [...item.sizes],
      unitAmount: item.unitAmount,
    })),
  };
}

/*
 * @behavior Calculate checkout session expiration time in Unix seconds.
 *           Caps at 23 hours from current time or 30 minutes after sale close,
 *           whichever is sooner.
 * @param catalog — catalog definition containing closesAt ISO string
 * @param nowMs — current timestamp in milliseconds
 * @returns integer Unix timestamp in seconds
 */
export function expiresAtSeconds(catalog, nowMs) {
  const twentyThreeHoursMs = nowMs + 23 * 3600 * 1000;
  const closeGraceMs = Date.parse(catalog.closesAt) + 30 * 60 * 1000;
  return Math.floor(Math.min(twentyThreeHoursMs, closeGraceMs) / 1000);
}

/*
 * @behavior Validate and resolve cart items into concrete line items with pricing.
 *           Consolidates duplicate sku+size lines and enforces provider amount limits.
 * @param catalog — catalog definition containing items list
 * @param items — raw cart items array from client request
 * @returns { ok: true, lines: [...] } | { ok: false, message: string }
 */
export function resolveCartLines(catalog, items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    return { ok: false, message: "Cart must contain between 1 and 100 items." };
  }

  const catalogItemsBySku = new Map(catalog.items.map((i) => [i.sku, i]));
  const consolidatedLines = new Map();

  for (const entry of items) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, message: "Each cart item must be an object." };
    }
    if (typeof entry.sku !== "string" || entry.sku.trim() === "") {
      return { ok: false, message: "Item sku must be a non-empty string." };
    }
    if (typeof entry.size !== "string" || entry.size.trim() === "") {
      return { ok: false, message: "Item size must be a non-empty string." };
    }
    if (!Number.isSafeInteger(entry.quantity) || entry.quantity < 1) {
      return { ok: false, message: "Item quantity must be a positive integer." };
    }
    const item = catalogItemsBySku.get(entry.sku);
    if (!item) {
      return { ok: false, message: `Item with sku "${entry.sku}" was not found in catalog.` };
    }
    if (!item.sizes.includes(entry.size)) {
      return {
        ok: false,
        message: `Size "${entry.size}" is not available for ${item.name} (${item.sku}).`,
      };
    }
    const lineKey = `${entry.sku}:::${entry.size}`;
    const existing = consolidatedLines.get(lineKey);
    if (existing) {
      const summedQuantity = existing.quantity + entry.quantity;
      if (!Number.isSafeInteger(summedQuantity) || summedQuantity < 1) {
        return {
          ok: false,
          message: `Consolidated quantity for ${item.name} (${entry.size}) exceeds safe limits.`,
        };
      }
      existing.quantity = summedQuantity;
    } else {
      consolidatedLines.set(lineKey, {
        sku: item.sku,
        name: item.name,
        size: entry.size,
        quantity: entry.quantity,
        unitAmount: item.unitAmount,
      });
    }
  }

  const lines = Array.from(consolidatedLines.values());
  if (lines.length > 100) {
    return { ok: false, message: "Cart cannot exceed 100 distinct items." };
  }

  const MAX_AMOUNT_CENTS = 99999999;
  let cartTotalCents = 0;
  for (const line of lines) {
    const lineTotal = line.unitAmount * line.quantity;
    if (lineTotal > MAX_AMOUNT_CENTS) {
      return {
        ok: false,
        message: `Line total for ${line.name} (${line.size}) exceeds provider maximum limit.`,
      };
    }
    cartTotalCents += lineTotal;
    if (cartTotalCents > MAX_AMOUNT_CENTS) {
      return {
        ok: false,
        message: "Cart total exceeds provider maximum limit.",
      };
    }
  }

  return { ok: true, lines };
}
