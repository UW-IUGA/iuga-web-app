/*
Purpose: The shop's rules with no database and no network: what a cart must look like, whether
         a sale window is open, the prices the buyer is agreeing to, and how an order moves
         through payment, fulfilment, refund, and dispute.

Called by: checkoutCoordinator (cart rules and pricing); the payment and fulfilment work will
           call the four apply* functions.

Must not: read the database, call Stripe, or invent a price. Every function here is a pure
          answer computed from what it is given.

Words used here: a "drop" is one sales window, with its own dates and price list; a "variant"
          (field name skuKey) is one buyable version of a product — the hoodie, purple, size M;
          money is always whole cents ("minor units"), never dollars with decimals.
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
 * Purpose:   Turn whatever the shop page sent into the one cart shape the rest of the shop
 *            trusts — trimmed variants, whole positive quantities, no repeats — and sort it, so
 *            the same cart always looks identical to the checkout flow.
 * @param     items — the cart as the browser sent it
 * @returns   a frozen, sorted list of { skuKey, quantity }
 * @exceptions throws when the cart is empty, repeats a variant, or asks for zero, half, or a
 *            nonsensical quantity
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
 * Purpose:   Answer whether a sale window is open right now, so a closed or not-yet-started
 *            window cannot sell anything.
 * @param     drop — the sale-window row: its start, its end, and whether it is switched on
 * @param     now — the moment to judge
 * @returns   true only when the window is switched on and now falls inside its dates
 * @exceptions throws when the window's dates are missing or malformed
 */
export function isSalesWindowOpen(drop, now = new Date()) {
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
 * Purpose:   Work out what this cart costs and lock it in: which variant, at what unit price,
 *            how many, and the total — the prices the buyer is agreeing to when they press Pay.
 * @param     cart — the normalized cart
 * @param     catalog — the price list rows for the open sale window
 * @param     drop — the open sale window
 * @param     now — the moment the prices are being locked at
 * @returns   a frozen snapshot: the window, its price-list revision, the currency, the priced
 *            items, and the total, all in whole cents
 * @exceptions throws when the window is closed, a variant is missing or unavailable, a unit
 *            price is not a positive whole number of cents, or a total would overflow
 */
export function snapshotQuote({ cart, catalog, drop, now = new Date() }) {
  if (!isSalesWindowOpen(drop, now)) {
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

  // Why: money is counted in whole cents. Dollars as decimals would quietly lose a cent per line
  //      and the buyer would be charged a total that does not match the prices we displayed.
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
 * Purpose:   Apply one verified payment event to an order. Payment is the one state we never
 *            undo: an order that is paid stays paid, and a "back to pending" event is refused.
 * @param     order — the order as it is now
 * @param     event — the confirmed payment event (type, or status "paid")
 * @returns   the order with paymentState "paid" and when it was paid
 * @exceptions throws when an event tries to move a paid order back to pending
 */
export function applyPaymentEvent(order, event = {}) {
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

// Which fulfilment steps are legal for an order the buyer collects in person.
const VALID_PICKUP_TRANSITIONS = Object.freeze({
  pending: ["preparing", "on_hold", "cancelled"],
  preparing: ["ready_for_pickup", "on_hold", "cancelled"],
  ready_for_pickup: ["picked_up", "on_hold", "cancelled"],
  picked_up: [],
  on_hold: ["pending", "preparing", "ready_for_pickup", "cancelled"],
  cancelled: [],
});

// Which fulfilment steps are legal for an order we post to the buyer.
const VALID_SHIPPING_TRANSITIONS = Object.freeze({
  pending: ["preparing", "on_hold", "cancelled"],
  preparing: ["shipped", "on_hold", "cancelled"],
  shipped: ["delivered", "on_hold"],
  delivered: [],
  on_hold: ["pending", "preparing", "shipped", "cancelled"],
  cancelled: [],
});

/*
 * Purpose:   Move an order one step through fulfilment — prepare it, mark it ready, hand it
 *            over, post it, hold it, or cancel it — refusing steps that are not allowed from
 *            where the order currently is.
 * @param     order — the order as it is now
 * @param     action — the step somebody is asking for, and why (for a hold)
 * @returns   the order with its new fulfilment state, plus the hold and tracking details
 * @exceptions throws on a step the order cannot take from its current state
 */
export function applyFulfillmentAction(order, action = {}) {
  const current = asRecord(order);
  // The order document stores this as fulfillmentMethod; anything that is not "shipping" means
  // the buyer collects in person, which is the document's own default.
  const fulfillmentMethod = current.fulfillmentMethod || "pickup";
  const state = current.fulfillmentState || "pending";
  const transitions = fulfillmentMethod === "shipping" ? VALID_SHIPPING_TRANSITIONS : VALID_PICKUP_TRANSITIONS;

  let nextFulfillmentState = state;
  // The order document keeps the hold as one object: why it was placed, when, and where the order
  // returns to when the hold is lifted.
  let fulfillmentHold = {
    reason: null,
    placedAt: null,
    returnToState: null,
    ...asRecord(current.fulfillmentHold),
  };

  switch (action.action) {
    case "prepare":
      nextFulfillmentState = "preparing";
      break;
    case "mark_ready":
      nextFulfillmentState = "ready_for_pickup";
      break;
    case "complete_pickup":
      nextFulfillmentState = "picked_up";
      break;
    case "ship":
      nextFulfillmentState = "shipped";
      break;
    case "deliver":
      nextFulfillmentState = "delivered";
      break;
    case "cancel":
      nextFulfillmentState = "cancelled";
      break;
    case "hold":
      nextFulfillmentState = "on_hold";
      fulfillmentHold = {
        reason: action.reason || "unspecified",
        placedAt: new Date(),
        returnToState: state,
      };
      break;
    case "release_hold":
      if (state !== "on_hold") {
        throw new Error("Cannot release hold on an order not on hold");
      }
      nextFulfillmentState = fulfillmentHold.returnToState || "pending";
      fulfillmentHold = { reason: null, placedAt: null, returnToState: null };
      break;
    default:
      throw new Error(`Unknown fulfillment action: ${action.action}`);
  }

  if (nextFulfillmentState !== state) {
    const allowed = transitions[state] || [];
    if (!allowed.includes(nextFulfillmentState) && action.action !== "release_hold") {
      throw new Error(`Illegal fulfillment transition from ${state} to ${nextFulfillmentState}`);
    }
  }

  return {
    ...current,
    fulfillmentState: nextFulfillmentState,
    fulfillmentHold,
    trackingNumber: action.trackingNumber ?? current.trackingNumber ?? null,
  };
}

/*
 * Purpose:   Track money going back to the buyer: reserve it, settle it, or drop a reservation —
 *            never more than we actually collected.
 * @param     order — the order as it is now, with its total in cents
 * @param     refundEvent — reserve / settle / fail, and how many cents
 * @returns   the order with updated refunded and pending-refund totals, and whether it is now
 *            partly or fully refunded
 * @exceptions throws when a refund would exceed what was collected, or the amount is not a
 *            positive whole number of cents
 */
export function applyRefundEvent(order, refundEvent = {}) {
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
 * Purpose:   Record a card dispute on an order: when the buyer's bank opens one, and how it ends.
 * @param     order — the order as it is now
 * @param     disputeEvent — the bank's action ("open" or "resolve") and its outcome
 * @returns   the order with its dispute state (none → open → won / lost / closed)
 * @exceptions throws when resolving a dispute that was never opened, or on an unknown outcome
 */
export function applyDisputeEvent(order, disputeEvent = {}) {
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
