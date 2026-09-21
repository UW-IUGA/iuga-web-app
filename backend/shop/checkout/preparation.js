/*
Purpose: Price a cart against the active catalog and prepare order, attempt, and Stripe records for checkout.
Authentication/Authorization Requirements: None. Used internally by the checkout coordinator.
Expected Request Information:
- Mongoose models, normalized cart, validated buyer identity, retry key, and shop configuration.
Expected Response Information:
- The prepared checkout bundle containing the order document, attempt document, frozen Stripe request, and catalog data, or null if pricing fails.
*/

import { randomUUID } from "node:crypto";

import { snapshotQuote } from "../domain.js";

const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

/**
 * @behavior Generate a unique record identifier using the provided factory or a 24-character random UUID.
 * @param createId — optional custom identifier generator function
 * @param prefix — entity type label passed to the custom generator
 * @returns a unique string identifier
 */
function makeId(createId, prefix) {
  if (typeof createId === "function") return createId(prefix);
  return randomUUID().replaceAll("-", "").slice(0, 24);
}

/**
 * @behavior Convert a variant descriptor into a string suitable for storage on an order line item.
 * @param value — the variant descriptor, which may be a string, object, null, or undefined
 * @returns the serialized variant string, or null when the value is missing
 */
function variantAsStoredString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * @behavior Extract the subset of catalog fields needed to price cart items in snapshotQuote.
 * @param entry — a persisted CatalogEntry document from the database
 * @returns an object containing skuKey, title, variant, unitAmountCents, and isAvailable
 */
function quoteCatalogRow(entry) {
  return {
    skuKey: entry.skuKey,
    title: entry.title,
    variant: entry.variant,
    unitAmountCents: entry.unitAmountCents,
    isAvailable: entry.isEnabled === true,
  };
}

/**
 * @behavior Find the active sale window and verify every cart item exists, is enabled, has a Stripe price, and stays within order limits.
 * @param models — Mongoose models providing ShopDrop and CatalogEntry collections
 * @param cart — the normalized list of items being purchased ({ skuKey, quantity })
 * @param checkoutNow — the Date representing the checkout time for window validation
 * @returns an object with activeSalesWindow and catalogRows if all items are valid, or null if the window is closed or an item is unavailable
 */
async function readCheckoutCatalog(models, cart, checkoutNow) {
  try {
    const activeSalesWindow = await models.ShopDrop.findOne({
      isEnabled: true,
      opensAt: { $lte: checkoutNow },
      closesAt: { $gt: checkoutNow },
    });
    const catalogRows = await models.CatalogEntry.find({
      dropKey: activeSalesWindow?.dropKey,
      catalogVersion: activeSalesWindow?.catalogVersion,
      isEnabled: true,
    });

    if (!activeSalesWindow || !Array.isArray(catalogRows)) return null;
    const catalogRowsBySkuKey = new Map(
      catalogRows.map((row) => [row.skuKey, row]),
    );
    for (const item of cart) {
      const row = catalogRowsBySkuKey.get(item.skuKey);
      if (
        !row ||
        row.isEnabled !== true ||
        typeof row.priceId !== "string" ||
        !row.priceId.trim()
      )
        return null;
      if (
        row.maxPerOrder !== undefined &&
        (!Number.isSafeInteger(row.maxPerOrder) ||
          row.maxPerOrder <= 0 ||
          item.quantity > row.maxPerOrder)
      )
        return null;
      if (
        !Number.isSafeInteger(row.unitAmountCents) ||
        row.unitAmountCents <= 0
      )
        return null;
    }
    return { activeSalesWindow, catalogRows };
  } catch {
    return null;
  }
}

/**
 * @behavior Price the cart against the active catalog and build the pending order and attempt records, price snapshot, and frozen Stripe request.
 * @param models — Mongoose models for reading catalog entries and sale windows
 * @param cart — the normalized list of items being purchased
 * @param normalizedOwner — the validated signed-in buyer identity ({ type, userId })
 * @param normalizedAttemptKey — the lower-cased retry key from the request header
 * @param cartFingerprint — deterministic JSON string representing the cart contents
 * @param checkoutNow — the Date representing the current checkout timestamp
 * @param baseUrl — the configured shop base URL
 * @param validateBaseUrl — validator function ensuring the base URL is an absolute HTTPS origin
 * @param createId — optional custom identifier generator function
 * @returns the prepared checkout bundle containing the order document, attempt document, frozen Stripe request, and catalog rows, or null if pricing fails
 * @exceptions CheckoutValidationError when the shop base URL is missing or malformed
 */
export async function prepareNewCheckout({
  models,
  cart,
  normalizedOwner,
  normalizedAttemptKey,
  requestCart,
  checkoutNow,
  baseUrl,
  validateBaseUrl,
  createId,
}) {
  const normalizedBaseUrl = validateBaseUrl(baseUrl);
  const catalog = await readCheckoutCatalog(models, cart, checkoutNow);
  if (!catalog) return null;

  let quote;
  try {
    // The prices, quantities, and total the buyer is agreeing to, stored below so a later price
    // change cannot rewrite this order.
    quote = snapshotQuote({
      cart,
      catalog: catalog.catalogRows.map(quoteCatalogRow),
      drop: catalog.activeSalesWindow,
      now: checkoutNow,
    });
  } catch {
    return null;
  }

  const attemptId = makeId(createId, "checkout-attempt");
  const orderId = makeId(createId, "order");
  const orderReference = `ORD-${orderId}`;
  // The key Stripe sees, derived from our attempt id and never from the browser, so two buyers
  // who send the same retry key can never share one Stripe payment.
  const providerIdempotencyKey = `iuga:checkout:${attemptId}`;
  const expiresAt = new Date(checkoutNow.getTime() + ATTEMPT_WINDOW_MS);
  const frozenStripeRequest = {
    lineItems: quote.items.map((item) => ({
      priceId: catalog.catalogRows.find((row) => row.skuKey === item.skuKey)
        .priceId,
      quantity: item.quantity,
    })),
    successUrl: `${normalizedBaseUrl}/shop/checkout/success`,
    cancelUrl: `${normalizedBaseUrl}/shop/checkout/cancel`,
    expiresAt: Math.floor(expiresAt.getTime() / 1000),
    clientReferenceId: String(orderId),
    metadata: { attempt: String(attemptId), order: String(orderId) },
  };

  return {
    attemptQuery: {
      "owner.type": normalizedOwner.type,
      "owner.userId": normalizedOwner.userId,
      attemptKey: normalizedAttemptKey,
    },
    orderReference,
    attemptDocument: {
      _id: attemptId,
      owner: normalizedOwner,
      attemptKey: normalizedAttemptKey,
      providerIdempotencyKey,
      attemptCart: requestCart,
      items: cart,
      catalogVersion: String(catalog.activeSalesWindow.catalogVersion),
      dropKey: catalog.activeSalesWindow.dropKey,
      quoteSnapshot: quote,
      frozenStripeRequest,
      expiresAt,
      firstSubmissionAt: checkoutNow,
      status: "pending",
      orderId,
      sessionId: null,
      paymentIntentId: null,
    },
    orderDocument: {
      _id: orderId,
      owner: normalizedOwner,
      orderReference,
      items: quote.items.map((item) => ({
        ...item,
        variant: variantAsStoredString(item.variant),
      })),
      currency: quote.currency,
      totalCents: quote.totalCents,
      quoteSnapshot: quote,
      paymentState: "pending",
      fulfillmentState: "pending",
      refundState: "none",
      pendingRefundCents: 0,
      refundedCents: 0,
    },
    cart,
    catalogRows: catalog.catalogRows,
    frozenStripeRequest,
    providerIdempotencyKey,
    expiresAt,
    checkoutNow,
  };
}
