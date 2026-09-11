/**
 * Pure domain contracts, validations, quote calculations, and state reducers
 * for the IUGA Stripe merchandise store.
 */

function asRecord(value) {
  return value !== null && typeof value === "object" ? value : {};
}

function parseDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Invalid Date provided");
    }
    return value;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`Invalid date string: ${value}`);
    }
    return parsed;
  }
  throw new Error(`Unsupported date value: ${value}`);
}

/*
 * @behavior  Validates and normalizes cart items, sorting deterministically and rejecting duplicate SKUs.
 * @param     items — raw cart items array from client request
 * @returns   frozen array of normalized { skuKey, quantity } records
 * @exceptions throws on non-array, empty cart, duplicate SKUs, invalid SKU strings, or non-positive integer quantities
 */
export function normalizeCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Cart must be a non-empty array of items");
  }

  const seenSkus = new Set();
  const normalized = [];

  for (const item of items) {
    if (!item || typeof item !== "object") {
      throw new Error("Cart item must be an object");
    }

    const skuKey = typeof item.skuKey === "string" ? item.skuKey.trim() : "";
    if (!skuKey) {
      throw new Error("Each cart item must have a non-empty skuKey");
    }

    if (seenSkus.has(skuKey)) {
      throw new Error(`Duplicate SKU detected in cart: ${skuKey}`);
    }
    seenSkus.add(skuKey);

    const quantity = item.quantity;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error(`Item ${skuKey} must have a positive safe integer quantity`);
    }

    normalized.push(Object.freeze({ skuKey, quantity }));
  }

  // Sort deterministically by skuKey ascending
  normalized.sort((a, b) => a.skuKey.localeCompare(b.skuKey));
  return Object.freeze(normalized);
}

/*
 * @behavior  Evaluates whether a drop is currently active within its UTC time boundaries.
 * @param     drop — shop drop record containing opensAt, closesAt, and isEnabled
 * @param     now — current timestamp to compare against
 * @returns   boolean indicating if drop is open for orders
 * @exceptions throws on malformed date fields
 */
export function isDropActive(drop, now = new Date()) {
  const record = asRecord(drop);
  if (record.isEnabled !== true) {
    return false;
  }

  const opensAt = parseDate(record.opensAt);
  const closesAt = parseDate(record.closesAt);
  const currentTime = parseDate(now);

  return currentTime.getTime() >= opensAt.getTime() && currentTime.getTime() < closesAt.getTime();
}

/*
 * @behavior  Computes and freezes an immutable quote snapshot from normalized cart items and active catalog.
 * @param     cart — normalized cart items
 * @param     catalog — collection of active catalog entries for the drop
 * @param     drop — active shop drop
 * @param     now — reference timestamp for drop validity and quote timestamp
 * @returns   frozen quote snapshot with safe integer minor-unit totals
 * @exceptions throws if drop is inactive, SKU is not found, item is unavailable, or integer overflow occurs
 */
export function freezeQuote({ cart, catalog, drop, now = new Date() }) {
  if (!isDropActive(drop, now)) {
    throw new Error("Cannot freeze quote for an inactive drop");
  }

  const catalogList = Array.isArray(catalog) ? catalog : [];
  const catalogBySku = new Map();
  for (const entry of catalogList) {
    if (entry && typeof entry.skuKey === "string") {
      catalogBySku.set(entry.skuKey, entry);
    }
  }

  const quotedAt = parseDate(now);
  const dropRecord = asRecord(drop);
  const currency = typeof dropRecord.currency === "string" ? dropRecord.currency.toLowerCase() : "usd";

  let totalMinor = 0;
  const quotedItems = [];

  for (const item of cart) {
    const entry = catalogBySku.get(item.skuKey);
    if (!entry) {
      throw new Error(`SKU ${item.skuKey} not found in catalog for drop ${dropRecord.dropKey}`);
    }

    if (entry.isAvailable !== true) {
      throw new Error(`SKU ${item.skuKey} is currently unavailable`);
    }

    if (!Number.isSafeInteger(entry.unitAmountMinor) || entry.unitAmountMinor <= 0) {
      throw new Error(`Catalog entry ${item.skuKey} has invalid unitAmountMinor`);
    }

    const subtotalMinor = item.quantity * entry.unitAmountMinor;
    if (!Number.isSafeInteger(subtotalMinor)) {
      throw new Error(`Subtotal minor unit overflow for SKU ${item.skuKey}`);
    }

    totalMinor += subtotalMinor;
    if (!Number.isSafeInteger(totalMinor)) {
      throw new Error("Total minor unit overflow");
    }

    quotedItems.push(
      Object.freeze({
        skuKey: item.skuKey,
        title: entry.title,
        variant: entry.variant,
        quantity: item.quantity,
        unitAmountMinor: entry.unitAmountMinor,
        subtotalMinor,
      }),
    );
  }

  return Object.freeze({
    dropKey: dropRecord.dropKey,
    catalogVersion: dropRecord.catalogVersion,
    currency,
    items: Object.freeze(quotedItems),
    totalMinor,
    quotedAt,
  });
}

/*
 * @behavior  Reduces payment state based on verified payment events, enforcing non-regressing paid status.
 * @param     order — existing order state
 * @param     event — incoming payment event
 * @returns   updated order state
 * @exceptions throws on attempts to regress a paid order back to pending
 */
export function reducePayment(order, event = {}) {
  const current = asRecord(order);
  const currentPaymentState = current.paymentState || "pending";

  if (currentPaymentState === "paid") {
    if (event.type === "reset_to_pending" || event.status === "pending") {
      throw new Error("Cannot regress paid state back to pending");
    }
    // Idempotent paid event: preserve existing paidAt and status
    return { ...current };
  }

  if (event.type === "payment_confirmed" || event.status === "paid") {
    return {
      ...current,
      paymentState: "paid",
      paidAt: event.paidAt ? parseDate(event.paidAt) : new Date(),
      providerPaymentId: event.providerPaymentId || current.providerPaymentId,
    };
  }

  return { ...current };
}

const VALID_PICKUP_TRANSITIONS = Object.freeze({
  pending: ["preparing", "on_hold", "cancelled"],
  preparing: ["ready_for_pickup", "on_hold", "cancelled"],
  ready_for_pickup: ["picked_up", "on_hold", "cancelled"],
  picked_up: [],
  on_hold: ["pending", "preparing", "ready_for_pickup", "cancelled"],
  cancelled: [],
});

const VALID_SHIPPING_TRANSITIONS = Object.freeze({
  pending: ["preparing", "on_hold", "cancelled"],
  preparing: ["shipped", "on_hold", "cancelled"],
  shipped: ["delivered", "on_hold"],
  delivered: [],
  on_hold: ["pending", "preparing", "shipped", "cancelled"],
  cancelled: [],
});

/*
 * @behavior  Transitions fulfillment state for pickup or shipping orders while managing holds.
 * @param     order — existing order state
 * @param     action — fulfillment action command
 * @returns   updated order state
 * @exceptions throws on illegal state transitions
 */
export function reduceFulfillment(order, action = {}) {
  const current = asRecord(order);
  const mode = current.fulfillmentMode || "pickup";
  const state = current.fulfillmentState || "pending";
  const transitions = mode === "shipping" ? VALID_SHIPPING_TRANSITIONS : VALID_PICKUP_TRANSITIONS;

  let targetState = state;
  let holdReason = current.holdReason ?? null;
  let previousState = current.previousFulfillmentState ?? state;

  switch (action.action) {
    case "prepare":
      targetState = "preparing";
      break;
    case "mark_ready":
      targetState = "ready_for_pickup";
      break;
    case "complete_pickup":
      targetState = "picked_up";
      break;
    case "ship":
      targetState = "shipped";
      break;
    case "deliver":
      targetState = "delivered";
      break;
    case "cancel":
      targetState = "cancelled";
      break;
    case "hold":
      targetState = "on_hold";
      previousState = state;
      holdReason = action.reason || "unspecified";
      break;
    case "release_hold":
      if (state !== "on_hold") {
        throw new Error("Cannot release hold on an order not on hold");
      }
      targetState = previousState || "pending";
      holdReason = null;
      break;
    default:
      throw new Error(`Unknown fulfillment action: ${action.action}`);
  }

  if (targetState !== state) {
    const allowed = transitions[state] || [];
    if (!allowed.includes(targetState) && action.action !== "release_hold") {
      throw new Error(`Illegal fulfillment transition from ${state} to ${targetState}`);
    }
  }

  return {
    ...current,
    fulfillmentState: targetState,
    holdReason,
    previousFulfillmentState: previousState,
    trackingNumber: action.trackingNumber || current.trackingNumber,
  };
}

/*
 * @behavior  Reduces refund state (reserve, settle, fail) within the collected payment budget.
 * @param     order — existing order state
 * @param     refundEvent — refund action and amount
 * @returns   updated order with updated refund totals and refundState
 * @exceptions throws if refund exceeds collected payment budget
 */
export function reduceRefund(order, refundEvent = {}) {
  const current = asRecord(order);
  const totalMinor = Number.isSafeInteger(current.totalMinor) ? current.totalMinor : 0;
  let refundedMinor = Number.isSafeInteger(current.refundedMinor) ? current.refundedMinor : 0;
  let pendingRefundMinor = Number.isSafeInteger(current.pendingRefundMinor) ? current.pendingRefundMinor : 0;
  const amountMinor = Number.isSafeInteger(refundEvent.amountMinor) ? refundEvent.amountMinor : 0;

  if (amountMinor <= 0) {
    throw new Error("Refund amount must be a positive safe integer");
  }

  switch (refundEvent.action) {
    case "reserve": {
      if (refundedMinor + pendingRefundMinor + amountMinor > totalMinor) {
        throw new Error(`Refund budget exceeded: available is ${totalMinor - refundedMinor - pendingRefundMinor}, requested ${amountMinor}`);
      }
      pendingRefundMinor += amountMinor;
      break;
    }
    case "settle": {
      if (amountMinor > pendingRefundMinor) {
        // Direct settlement or settling more than pending
        if (refundedMinor + amountMinor > totalMinor) {
          throw new Error("Refund budget exceeded on settlement");
        }
        pendingRefundMinor = Math.max(0, pendingRefundMinor - amountMinor);
      } else {
        pendingRefundMinor -= amountMinor;
      }
      refundedMinor += amountMinor;
      break;
    }
    case "fail": {
      pendingRefundMinor = Math.max(0, pendingRefundMinor - amountMinor);
      break;
    }
    default:
      throw new Error(`Unknown refund action: ${refundEvent.action}`);
  }

  let refundState = "none";
  if (refundedMinor === totalMinor && totalMinor > 0) {
    refundState = "full";
  } else if (refundedMinor > 0) {
    refundState = "partial";
  }

  return {
    ...current,
    refundedMinor,
    pendingRefundMinor,
    refundState,
  };
}

/*
 * @behavior  Reduces dispute state from none to open, and open to won/lost/closed.
 * @param     order — existing order state
 * @param     disputeEvent — dispute event action and outcome
 * @returns   updated order with updated dispute record
 * @exceptions throws when resolving a dispute that is not open
 */
export function reduceDispute(order, disputeEvent = {}) {
  const current = asRecord(order);
  const currentDispute = asRecord(current.dispute);
  const state = currentDispute.state || "none";

  if (disputeEvent.action === "open") {
    return {
      ...current,
      dispute: {
        state: "open",
        reason: disputeEvent.reason || null,
        evidenceDueBy: disputeEvent.evidenceDueBy ? parseDate(disputeEvent.evidenceDueBy) : null,
      },
    };
  }

  if (disputeEvent.action === "resolve") {
    if (state !== "open") {
      throw new Error("Cannot resolve dispute: dispute not open");
    }
    const outcome = disputeEvent.outcome;
    if (outcome !== "won" && outcome !== "lost" && outcome !== "closed") {
      throw new Error(`Invalid dispute outcome: ${outcome}`);
    }
    return {
      ...current,
      dispute: {
        ...currentDispute,
        state: outcome,
      },
    };
  }

  throw new Error(`Unknown dispute action: ${disputeEvent.action}`);
}
