/*
Purpose: The whole checkout flow for one buyer. It records the attempt (order, stock holds,
         agreed prices), asks Stripe for a payment link, and keeps the answer — so that
         pressing Pay twice, retrying after a timeout, or reloading the page always lands on
         the same attempt and never on a second charge.

Called by: POST /api/v1/shop/checkout-sessions, through the shop controller.

Must not: contact Stripe before the attempt is written down, trust a browser-supplied price,
          quantity, or identity, or retry an attempt whose outcome we cannot explain.
*/

import { randomUUID } from "node:crypto";

import mongoose from "mongoose";
import { normalizeCart, freezeQuote } from "../shop/domain.js";
import { holdInventory } from "../shop/reservations.js";

// Why: a buyer may take a while to finish paying, but an abandoned attempt must not hold stock
// — or hold a price — for the rest of the sale window.
const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

// Why: 23 hours, not 24. Stripe retires a payment link after 24 hours, so anything older may
// already be dead there and a human has to check before we try again.
const MAX_RETRY_AGE_MS = 23 * 60 * 60 * 1000;

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

// The buyer-facing order id, shown instead of our internal database id.
async function readOrderReference(models, attempt) {
  const order = await models.Order.findById(attempt.orderId);
  return order?.orderReference ?? null;
}

/*
Purpose: "Here is the link to pay." This is the only result that carries a payment link, and it
         carries one only because the caller just confirmed the link still works.
*/
function readyResult(attemptKey, orderReference, checkoutUrl, isNew) {
  return { status: "ready", isNew, attemptKey, orderReference, checkoutUrl };
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
Purpose: "A human must look at Stripe before we touch this order." Used whenever we cannot say
         whether a payment link exists — a timeout, an unclear answer, or an attempt left alone
         for too long. Retrying automatically could create a second charge.
*/
function needsManualCheckResult(attempt, orderReference) {
  return {
    status: "reconciliation_required",
    attemptKey: attempt.attemptKey,
    orderReference,
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

// The buyer reused their retry key with a different cart: that is a different purchase.
function conflictResult() {
  return { status: "conflict" };
}

// An attempt that ended for good keeps its own status, so a client can stop asking.
function terminalResult(attempt, orderReference) {
  return { status: attempt.status, attemptKey: attempt.attemptKey, orderReference };
}

/*
Purpose: Run work in one database transaction, so a half-written attempt is impossible.
         Injected in tests, where there is no database.
*/
function runInTransaction(work) {
  return mongoose.connection.transaction(work);
}

/*
Purpose: Reach Stripe with the credentials this deployment is configured with. Callers may
         inject their own (tests, and the shop controller, always do).
*/
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
Purpose: Can we still send this buyer back to the payment link Stripe gave us?
Why: Stripe reports the expiry in epoch seconds while the stored attempt may hold either shape,
     and a link that is no longer open must never be handed out again.
*/
function isReusableStripeSession(session, now) {
  const expiresAt = typeof session?.expiresAt === "number"
    ? session.expiresAt * 1000
    : new Date(session?.expiresAt).getTime();
  return session?.status === "open" && session.url && Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

/*
Purpose: Attach the payment link to the attempt, but only while the attempt is still waiting.
Why: two requests can race (a double press, a retry). The first to arrive wins; whoever loses
     keeps the winner's answer instead of overwriting a usable payment link.
*/
async function attachReadySession(models, attemptFilter, session) {
  return models.CheckoutAttempt.findOneAndUpdate(
    { ...attemptFilter, status: "pending" },
    { $set: { status: "ready", sessionId: session.id, paymentIntentId: session.paymentIntentId ?? null } },
  );
}

/*
 * @behavior Replays an existing attempt for this buyer and retry key, or creates one, prices
 *           it, dispatches it to Stripe, and attaches the payment link — resolving it from
 *           durable state instead of creating a second charge whenever the outcome is unclear.
 * @param args models, owner, UUIDv4 attemptKey, cart items, readiness, provider and clock seams.
 * @returns ready (with a payment link), pending, conflict, terminal, or unavailable.
 * @exceptions CheckoutValidationError for a malformed owner, retry key, base URL, cart, or clock.
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

  // Everything below is scoped to this buyer, so one buyer's retry key can never reach another
  // buyer's attempt, order, or payment link.
  const attemptFilter = {
    "owner.type": normalizedOwner.type,
    "owner.userId": normalizedOwner.userId,
    attemptKey: normalizedAttemptKey,
  };
  const cartFingerprint = JSON.stringify(cart);

  // Look for this buyer's earlier attempt before doing any new work. A retry, a refresh, or a
  // double press must find its own attempt even when checkout has since been switched off.
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

    // The earlier request never reached Stripe (it died after writing the attempt). Safe to send
    // the same request again, with the same key, before either cutoff above is reached.
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
    // Answer from that attempt rather than starting a second order.
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
  // by looking the attempt up again instead of by charging anyone twice.
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
