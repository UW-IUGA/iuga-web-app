/*
 * @behavior Run the whole checkout flow for one buyer: record the attempt, its stock holds,
 *           and its agreed prices, then ask Stripe for a payment link. Pressing Pay twice,
 *           retrying after a timeout, or reloading always lands on the same attempt and never
 *           on a second charge.
 */

import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import { normalizeCart, snapshotQuote } from "../shop/domain.js";
import { holdInventory } from "../shop/reservations.js";

// A buyer may take a while to finish paying, but an abandoned attempt must not hold stock — or
// hold a price — for the rest of the sale window.
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

// 23 hours, not 24: Stripe retires a payment link after 24 hours, so anything older may already
// be dead there and a human has to check before we try again.
const MAX_RETRY_AGE_MS = 23 * 60 * 60 * 1000;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/*
 * @behavior Turn a validation failure into a 400 that carries a generic message only, so no
 *           internal rule, record, or configuration detail reaches the buyer.
 */
export class CheckoutValidationError extends Error {
  constructor(message = "Invalid checkout request") {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

// The buyer is whoever the session says they are, narrowed to a real, non-empty user id.
function validateOwner(owner) {
  if (!owner || owner.type !== "user" || typeof owner.userId !== "string" || !owner.userId.trim()) {
    throw new CheckoutValidationError("Invalid checkout owner");
  }
  return { type: "user", userId: owner.userId };
}

/*
 * @behavior Require the shop's own https address, so the return links we store can never point
 *           at somebody else's site.
 * @exceptions CheckoutValidationError when the base URL is missing, non-https, or has parts
 *             beyond the origin
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

// The buyer-facing order id, shown instead of our internal database id.
async function readOrderReference(models, attempt) {
  const order = await models.Order.findById(attempt.orderId);
  return order?.orderReference ?? null;
}

// The ready answer: the only result carrying a link, and only because the caller just confirmed
// that link still works.
function readyResult(attemptKey, orderReference, checkoutUrl, isNew) {
  return { status: "ready", isNew, attemptKey, orderReference, checkoutUrl };
}

// An attempt exists but has no usable link yet, so the buyer is asked to try again shortly.
function stillProcessingResult(attempt, orderReference) {
  return {
    status: "pending",
    attemptKey: attempt.attemptKey,
    orderReference,
  };
}

// We cannot say whether Stripe made a link, so a human checks before anything retries.
function needsManualCheckResult(attempt, orderReference) {
  return {
    status: "reconciliation_required",
    attemptKey: attempt.attemptKey,
    orderReference,
  };
}

// The single refusal, which deliberately does not say why: the cause is never the buyer's to see.
function unavailable() {
  return { status: "unavailable" };
}

// The retry key came back with a different cart: that is a different purchase.
function conflictResult() {
  return { status: "conflict" };
}

// An attempt that ended for good keeps its own status, so a client can stop asking.
function terminalResult(attempt, orderReference) {
  return { status: attempt.status, attemptKey: attempt.attemptKey, orderReference };
}

// Run work in one database transaction, so a half-written attempt is impossible. Tests replace
// this seam, because they have no database.
function runInTransaction(work) {
  return mongoose.connection.transaction(work);
}

// Reach Stripe with this deployment's credentials. Tests and the shop controller inject their own.
async function defaultProvider() {
  const { createStripeProviderClient } = await import("./stripeProviderClient.js");
  return createStripeProviderClient({
    secretKey: process.env.STRIPE_SECRET_KEY,
    apiVersion: process.env.STRIPE_API_VERSION,
    fetchImpl: globalThis.fetch,
  });
}

// One id per attempt and per order. Tests inject their own so the ids stay predictable.
function makeId(createId, prefix) {
  if (typeof createId === "function") return createId(prefix);
  return randomUUID().replaceAll("-", "").slice(0, 24);
}

// The clock is a seam so tests can pin "now" and prove the sale-window rules.
function coerceNowToDate(clock) {
  const value = typeof clock === "function" ? clock() : clock;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new CheckoutValidationError("Invalid checkout clock");
  return date;
}

// Order lines keep one short description of the variant, while the catalog keeps size, colour,
// and style separately — so the description is flattened into the value the order stores.
function variantAsStoredString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

// Give the pricing step (snapshotQuote) the few fields it reads, as plain data: catalog rows
// arrive as Mongoose documents, and spreading one yields an empty-looking row.
function quoteCatalogRow(entry) {
  return {
    skuKey: entry.skuKey,
    title: entry.title,
    variant: entry.variant,
    unitAmountMinor: entry.unitAmountMinor,
    isAvailable: entry.isEnabled === true,
  };
}

// Can we still send this buyer back to the link Stripe gave us? Stripe reports the expiry in
// epoch seconds while the stored attempt may hold either shape, and a closed link is never reused.
function isReusableStripeSession(session, now) {
  const expiresAt = typeof session?.expiresAt === "number"
    ? session.expiresAt * 1000
    : new Date(session?.expiresAt).getTime();
  return session?.status === "open" && session.url && Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

// Attach the link only while the attempt is still pending: two requests can race (a double
// press, a retry), and the first to arrive wins over overwriting a usable link.
async function attachReadySession(models, attemptFilter, session) {
  return models.CheckoutAttempt.findOneAndUpdate(
    { ...attemptFilter, status: "pending" },
    { $set: { status: "ready", sessionId: session.id, paymentIntentId: session.paymentIntentId ?? null } },
  );
}

/*
 * @behavior Replay this buyer's attempt for the retry key, or create one: price the cart, take
 *           stock, record the attempt, then ask Stripe for a payment link. Whenever the outcome
 *           is unclear it answers from durable state instead of risking a second charge.
 * @param models — the storage collections checkout reads and writes
 * @param owner — the signed-in buyer, taken from the session only
 * @param attemptKey — the browser's Idempotency-Key, lower-cased
 * @param items — the cart exactly as the browser sent it
 * @param checkoutEnabled — readiness override; false refuses a new attempt
 * @param getProvider, now, transaction, createId — seams tests replace
 * @returns ready (with a link), pending, conflict, a terminal status, or unavailable
 * @exceptions CheckoutValidationError for an unusable owner, retry key, base URL, cart, or clock
 */
export async function createCheckout({
  models,
  owner,
  attemptKey,
  items,
  checkoutEnabled = false,
  getProvider = defaultProvider,
  baseUrl = process.env.STRIPE_BASE_URL,
  now = new Date(),
  transaction = runInTransaction,
  createId,
} = {}) {
  const normalizedOwner = validateOwner(owner);
  // The buyer's own Idempotency-Key, lower-cased so the same press of Pay always compares equal.
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

  // Scoped to this buyer, so one buyer's retry key can never reach another buyer's attempt.
  const attemptFilter = {
    "owner.type": normalizedOwner.type,
    "owner.userId": normalizedOwner.userId,
    attemptKey: normalizedAttemptKey,
  };
  const cartFingerprint = JSON.stringify(cart);

  // Look for this buyer's earlier attempt first. A retry, refresh, or double press must find its
  // own attempt even when checkout has since been switched off.
  const existing = await models.CheckoutAttempt.findOne(attemptFilter);
  if (existing) {
    if (existing.cartFingerprint !== cartFingerprint) return conflictResult();
    const orderReference = await readOrderReference(models, existing);
    if (!orderReference) return unavailable();

    if (existing.status === "ready" && existing.sessionId) {
      try {
        const provider = await getProvider();
        const session = await provider.retrieveCheckoutSession({ sessionId: existing.sessionId });
        if (!isReusableStripeSession(session, checkoutNow)) return stillProcessingResult(existing, orderReference);
        return readyResult(normalizedAttemptKey, orderReference, session.url, false);
      } catch {
        return stillProcessingResult(existing, orderReference);
      }
    }
    if (existing.status === "reconciliation_required") return needsManualCheckResult(existing, orderReference);
    if (existing.status === "expired" || existing.status === "failed") return terminalResult(existing, orderReference);
    // A stale attempt stops here: past its own window, or past the age Stripe would still honour.
    if (existing.expiresAt && checkoutNow >= new Date(existing.expiresAt)) return needsManualCheckResult(existing, orderReference);
    if (existing.firstSubmissionAt && checkoutNow.getTime() >= new Date(existing.firstSubmissionAt).getTime() + MAX_RETRY_AGE_MS) {
      return needsManualCheckResult(existing, orderReference);
    }
    if (!checkoutEnabled) return stillProcessingResult(existing, orderReference);
    if (!existing.frozenStripeRequest) return stillProcessingResult(existing, orderReference);

    // The earlier request died after writing the attempt, before reaching Stripe. Sending the
    // same request again with the same key is safe before either cutoff above is reached.
    try {
      const provider = await getProvider();
      const session = await provider.createCheckoutSession({
        frozenStripeRequest: existing.frozenStripeRequest,
        idempotencyKey: existing.providerIdempotencyKey,
      });
      if (!isReusableStripeSession(session, checkoutNow)) return stillProcessingResult(existing, orderReference);
      const attached = await attachReadySession(models, attemptFilter, session);
      if (!attached) return stillProcessingResult(existing, orderReference);
      return readyResult(normalizedAttemptKey, orderReference, session.url, false);
    } catch {
      await models.CheckoutAttempt.findOneAndUpdate(
        { ...attemptFilter, status: "pending" },
        { $set: { status: "reconciliation_required" } },
      );
      return needsManualCheckResult(existing, orderReference);
    }
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
    // The prices, quantities, and total the buyer is agreeing to, stored below so a later price
    // change cannot rewrite this order.
    quote = snapshotQuote({ cart, catalog: catalogRows.map(quoteCatalogRow), drop: activeSalesWindow, now: checkoutNow });
  } catch {
    return unavailable();
  }

  const attemptId = makeId(createId, "checkout-attempt");
  const orderId = makeId(createId, "order");
  const orderReference = `ORD-${orderId}`;
  // The key Stripe sees, derived from our attempt id and never from the browser, so two buyers
  // who send the same retry key can never share one Stripe payment.
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
    cartFingerprint,
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
    // The stock hold, the order, and the attempt are written together. If any one fails, none is
    // kept — never stock held for a missing order, nor an order with no stock behind it.
    await transaction(async (session) => {
      // The hold lasts exactly as long as the payment link: shorter could give the stock away
      // while the buyer can still pay, longer would sit on stock for a dead attempt.
      await holdInventory({
        models,
        orderId,
        items: cart,
        catalog: catalogRows,
        now: checkoutNow,
        ttlMs: ATTEMPT_WINDOW_MS,
        session,
      });
      await models.Order.create(orderDocument, { session });
      await models.CheckoutAttempt.create(attemptDocument, { session });
    });
  } catch (error) {
    // A duplicate-key failure means another request is already writing this buyer's attempt;
    // answer from that attempt instead of starting a second order.
    if (error?.code === 11000) {
      const raced = await models.CheckoutAttempt.findOne(attemptFilter);
      if (raced) {
        if (raced.cartFingerprint !== cartFingerprint) return conflictResult();
        const racedReference = await readOrderReference(models, raced);
        if (racedReference) return stillProcessingResult(raced, racedReference);
      }
    }
    return unavailable();
  }

  // Only now do we involve money: the attempt is written down, so a failure here is recoverable
  // by looking the attempt up again rather than by charging anyone twice.
  try {
    const provider = await getProvider();
    const session = await provider.createCheckoutSession({ frozenStripeRequest, idempotencyKey: providerIdempotencyKey });
    if (!isReusableStripeSession(session, checkoutNow)) return stillProcessingResult(attemptDocument, orderReference);
    const attached = await attachReadySession(models, attemptFilter, session);
    if (!attached) return stillProcessingResult(attemptDocument, orderReference);
    return readyResult(normalizedAttemptKey, orderReference, session.url, true);
  } catch {
    await models.CheckoutAttempt.findOneAndUpdate(
      { ...attemptFilter, status: "pending" },
      { $set: { status: "reconciliation_required" } },
    );
    return needsManualCheckResult(attemptDocument, orderReference);
  }
}
