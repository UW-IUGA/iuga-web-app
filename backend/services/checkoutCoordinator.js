/*
Purpose: The durable step of checkout. It turns an authenticated cart into one "checkout
         attempt": the order, the stock that order holds, the prices the buyer agreed to,
         and the exact Stripe request we will send later — all written before money moves.

Called by: POST /api/v1/shop/checkout-sessions, through the shop controller.

Must not: contact Stripe, or let the browser decide identity, prices, quantities, or the total.
*/

import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import { normalizeCart, freezeQuote } from "../shop/domain.js";
import { holdInventory } from "../shop/reservations.js";

// Why: a buyer may take a while to finish paying, but a attempt that is abandoned must not hold
// stock — or hold a price — for the rest of the sale window.
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*
Purpose: The one error a caller may turn into a 400. It carries a generic message only, so no
         internal rule, record, or configuration detail reaches the buyer.
*/
export class CheckoutValidationError extends Error {
  constructor(message = "Invalid checkout request") {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

// Who owns the purchase: the signed-in session user, narrowed to a real, non-empty user id.
function validateOwner(owner) {
  if (!owner || owner.type !== "user" || typeof owner.userId !== "string" || !owner.userId.trim()) {
    throw new CheckoutValidationError("Invalid checkout owner");
  }
  return { type: "user", userId: owner.userId };
}

/*
Purpose: Require the shop's own https address, taken from configuration, so the "come back here
         after paying" links we store can never point at somebody else's site.
*/
function validateBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new CheckoutValidationError("Invalid checkout base URL");
  }
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new CheckoutValidationError("Invalid checkout base URL");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname || parsed.username || parsed.password
    || (parsed.pathname !== "/" && parsed.pathname !== "")
    || parsed.search || parsed.hash) {
    throw new CheckoutValidationError("Invalid checkout base URL");
  }
  return parsed.toString().replace(/\/$/, "");
}

/*
Purpose: "The attempt exists, ask again shortly." It never carries a payment link, so an
         unfinished attempt can never be handed to a buyer as if it were ready to pay.
*/
function stillProcessingResult(attempt, orderReference) {
  return {
    status: "pending",
    attemptKey: attempt.attemptKey,
    orderReference,
  };
}

/*
Purpose: Run work in one database transaction, so a half-written attempt is impossible.
         Injected in tests, where there is no database.
*/
function runInTransaction(work) {
  return mongoose.connection.transaction(work);
}

// One id per attempt and per order. Tests inject their own so the ids stay predictable.
function makeId(createId, prefix) {
  if (typeof createId === "function") return createId(prefix);
  return randomUUID().replaceAll("-", "").slice(0, 24);
}

// The clock arrives as a seam so tests can pin "now" and prove the sale-window rules.
function coerceNowToDate(clock) {
  const value = typeof clock === "function" ? clock() : clock;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new CheckoutValidationError("Invalid checkout clock");
  return date;
}

/*
Purpose: Order lines keep one short description of the variant, while the catalog keeps the
         variant as separate size / colour / style fields, so that description is flattened
         into the single value the order stores.
*/
function variantAsStoredString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

/*
Purpose: Give the pricing step (freezeQuote) the handful of fields it reads, as plain data.
Why: catalog rows arrive as Mongoose documents, whose fields are not plain properties. Spreading
     such a row yields an empty-looking one, which would make every purchase look unpriced.
*/
function quoteCatalogRow(entry) {
  return {
    skuKey: entry.skuKey,
    title: entry.title,
    variant: entry.variant,
    unitAmountMinor: entry.unitAmountMinor,
    isAvailable: entry.isEnabled === true,
  };
}

/*
Purpose: The single "we cannot sell right now" answer. It deliberately does not say why: the
         cause can be an unconfigured shop, a closed sale window, a missing price, or no stock,
         and none of that belongs in a buyer's response.
*/
function unavailable() {
  return { status: "unavailable" };
}

/*
 * @behavior Validates a cart, prices it from the catalog, and durably records one pending
 *           checkout attempt with its order, its stock holds, and its frozen Stripe request.
 * @param args models, owner, UUIDv4 attemptKey, cart items, readiness, clock, and storage seams.
 * @returns a pending result carrying the attempt key and the human-facing order reference.
 * @exceptions CheckoutValidationError for a malformed owner, retry key, base URL, cart, or clock.
 */
export async function createCheckout({
  models,
  owner,
  attemptKey,
  items,
  checkoutEnabled = false,
  baseUrl = process.env.STRIPE_BASE_URL,
  now = new Date(),
  transaction = runInTransaction,
  createId,
} = {}) {
  const normalizedOwner = validateOwner(owner);
  // The retry key is the buyer's own Idempotency-Key header, lower-cased so the same press of
  // Pay always compares equal; it selects this buyer's attempt and nothing else.
  const normalizedAttemptKey = typeof attemptKey === "string" ? attemptKey.toLowerCase() : attemptKey;
  if (typeof normalizedAttemptKey !== "string" || !UUID_V4.test(normalizedAttemptKey)) {
    throw new CheckoutValidationError("Invalid checkout attempt key");
  }
  const checkoutNow = coerceNowToDate(now);
  let cart;
  try {
    cart = normalizeCart(items);
  } catch (error) {
    throw new CheckoutValidationError(error.message);
  }
  if (!models?.CheckoutAttempt || !models?.Order) {
    throw new CheckoutValidationError("Checkout storage is unavailable");
  }

  if (!checkoutEnabled) return unavailable();
  const normalizedBaseUrl = validateBaseUrl(baseUrl);
  let activeSalesWindow;
  let catalogRows;
  try {
    activeSalesWindow = await models.ShopDrop.findOne({
      isEnabled: true,
      opensAt: { $lte: checkoutNow },
      closesAt: { $gt: checkoutNow },
    });
    catalogRows = await models.CatalogEntry.find({
      dropKey: activeSalesWindow?.dropKey,
      catalogVersion: activeSalesWindow?.catalogVersion,
      isEnabled: true,
    });
    if (!activeSalesWindow || !Array.isArray(catalogRows)) return unavailable();
    const catalogRowsBySkuKey = new Map(catalogRows.map((row) => [row.skuKey, row]));
    for (const item of cart) {
      const row = catalogRowsBySkuKey.get(item.skuKey);
      if (!row || row.isEnabled !== true || typeof row.priceId !== "string" || !row.priceId.trim()) return unavailable();
      if (row.maxPerOrder !== undefined && (!Number.isSafeInteger(row.maxPerOrder) || row.maxPerOrder <= 0 || item.quantity > row.maxPerOrder)) return unavailable();
      if (!Number.isSafeInteger(row.unitAmountMinor) || row.unitAmountMinor <= 0) return unavailable();
    }
  } catch {
    return unavailable();
  }

  let quote;
  try {
    // freezeQuote turns the cart plus the catalog into the prices, quantities, and total the
    // buyer is agreeing to. Stored below, so a later price change cannot rewrite this order.
    quote = freezeQuote({ cart, catalog: catalogRows.map(quoteCatalogRow), drop: activeSalesWindow, now: checkoutNow });
  } catch {
    return unavailable();
  }

  const attemptId = makeId(createId, "checkout-attempt");
  const orderId = makeId(createId, "order");
  const orderReference = `ORD-${orderId}`;
  // The key Stripe sees. It is derived from our attempt id, never from the browser, so two
  // buyers who happen to send the same retry key can never share one Stripe payment.
  const providerIdempotencyKey = `iuga:checkout:${attemptId}`;
  const expiresAt = new Date(checkoutNow.getTime() + ATTEMPT_WINDOW_MS);
  const frozenStripeRequest = {
    lineItems: quote.items.map((item) => ({ priceId: catalogRows.find((row) => row.skuKey === item.skuKey).priceId, quantity: item.quantity })),
    successUrl: `${normalizedBaseUrl}/shop/checkout/success`,
    cancelUrl: `${normalizedBaseUrl}/shop/checkout/cancel`,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
    clientReferenceId: String(orderId),
    metadata: { attempt: String(attemptId), order: String(orderId) },
  };

  const attemptDocument = {
    _id: attemptId,
    owner: normalizedOwner,
    attemptKey: normalizedAttemptKey,
    providerIdempotencyKey,
    // Snapshot of the cart: if the same retry key ever arrives with different items, that is a
    // different purchase and must not reuse this attempt.
    cartFingerprint: JSON.stringify(cart),
    items: cart,
    catalogVersion: String(activeSalesWindow.catalogVersion),
    dropKey: activeSalesWindow.dropKey,
    quoteSnapshot: quote,
    frozenStripeRequest,
    expiresAt,
    firstSubmissionAt: checkoutNow,
    status: "pending",
    orderId,
    sessionId: null,
    paymentIntentId: null,
  };
  const orderDocument = {
    _id: orderId,
    owner: normalizedOwner,
    orderReference,
    items: quote.items.map((item) => ({ ...item, variant: variantAsStoredString(item.variant) })),
    currency: quote.currency,
    totalMinor: quote.totalMinor,
    quoteSnapshot: quote,
    paymentState: "pending",
    fulfillmentState: "pending",
    refundState: "none",
    pendingRefundMinor: 0,
    refundedMinor: 0,
  };

  try {
    // Why: the stock hold, the order, and the attempt are written together. If any one of them
    // fails, none is kept — otherwise stock would be held for an order that does not exist, or an
    // order would exist with no stock behind it.
    await transaction(async (session) => {
      await holdInventory({ models, orderId, items: cart, catalog: catalogRows, now: checkoutNow, session });
      await models.Order.create(orderDocument, { session });
      await models.CheckoutAttempt.create(attemptDocument, { session });
    });
  } catch (error) {
    // A duplicate-key failure means another request is already writing this buyer's attempt.
    // Nothing is written here, so we answer "not right now" rather than starting a second order.
    if (error?.code === 11000) return unavailable();
    return unavailable();
  }

  return stillProcessingResult(attemptDocument, orderReference);
}
