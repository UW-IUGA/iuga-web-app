import { randomUUID } from "node:crypto";

import { snapshotQuote } from "../domain.js";

const ATTEMPT_WINDOW_MS = 60 * 60 * 1000;

function makeId(createId, prefix) {
  if (typeof createId === "function") return createId(prefix);
  return randomUUID().replaceAll("-", "").slice(0, 24);
}

function variantAsStoredString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function quoteCatalogRow(entry) {
  return {
    skuKey: entry.skuKey,
    title: entry.title,
    variant: entry.variant,
    unitAmountCents: entry.unitAmountCents,
    isAvailable: entry.isEnabled === true,
  };
}

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

export async function prepareNewCheckout({
  models,
  cart,
  normalizedOwner,
  normalizedAttemptKey,
  cartFingerprint,
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
    attemptFilter: {
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
      cartFingerprint,
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
