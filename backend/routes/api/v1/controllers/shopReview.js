/*
Purpose: Let enabled IUGA officers review accepted manual Venmo purchases: list and search orders,
         read one order, record payment, amount received, and follow-up decisions one order at a time, and
         mark paid orders picked up at the pickup table.

Authentication/Authorization Requirements:
- Every route: the shop.purchases.review permission, checked on every request
  (GET /api/v1/user/permissions tells the site whether to offer this page)

Expected Request Information:
- GET /purchases: query { status?, balance?, followUp?, pickup?, q?, limit?, cursor? }
  (balance=short keeps orders with an amount received recorded below the total; pickup=ready keeps orders not
  marked picked up, and pickup=picked_up keeps orders that were)
- GET /purchases/counts
- GET /purchases/pickup: every order ready for pickup (Paid, not picked up), oldest first, up to 1000
- GET /purchases/:purchaseId
- PATCH /purchases/:purchaseId/payment: body { status, note?, expectedRevision }
  (note is the reason for the change, up to 500 characters; required when a picked-up order moves to any status but Paid)
- PATCH /purchases/:purchaseId/follow-up: body { followUpStatus, note?, expectedRevision }
  (followUpStatus is contacted, will_pay, says_paid, or none to clear; note is up to 500 characters)
- PATCH /purchases/:purchaseId/amount-received: body { amountReceivedCents, expectedRevision }
- POST /purchases/:purchaseId/notes: body { title, note?, expectedRevision }
  (an officer's own activity entry: a topic of up to 80 characters and an optional description)
- PATCH /purchases/:purchaseId/pickup: body { pickedUp, expectedRevision }
  (pickedUp true marks a paid order handed over; false clears the mark)

Expected Response Information:
- GET /purchases: 200 { status: "success", purchases: Order[], nextCursor: string | null }
- GET /purchases/counts: 200 { status: "success", counts: { pending, paid, ready, picked_up, not_paid, refunded, all, short,
  awaiting, says_paid }, totals: { expectedCents, receivedCents, owedCents, pendingOrders, receivedOrders, confirmedCents } }
  (confirmedCents is the money received on Paid orders; the other totals cover Pending orders)
- GET /purchases/pickup: 200 { status: "success", orders: PickupOrder[], truncated: boolean, limit: 1000,
  counts: { ready, pickedUp } } (counts cover every order, even past the limit; truncated means some ready orders are not listed)
- GET /purchases/:purchaseId and every PATCH route: 200 { status: "success", purchase: Order },
  where Order.buyer also carries the buyer's phone number for follow-up (never in the list)
- Order.amountBeforePaidCents (only on orders showing their total as received): the amount received that a move to
  Pending or Not paid restores, or null when none was recorded
  - 400 Invalid input or out-of-date cursor
  - 401 Not authenticated
  - 403 Not authorized
  - 404 Order not found
  - 409 Stale revision, refused payment change (a picked-up order changed without a reason), or no room to mark a dropped order paid
  - 500 Inconsistent stock counts or database failure
Every response is private and not cached.
*/

import express from "express";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";
import * as defaultReviewStore from "../utils/shopPurchaseReview.js";
import { PICKUP_BOARD_LIMIT, ShopReviewError } from "../utils/shopPurchaseReview.js";

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const STATUSES = new Set(["pending", "paid", "not_paid", "refunded"]);
const FOLLOW_UPS = new Set(["all", "awaiting", "none"]);
const BALANCES = new Set(["all", "short"]);
const PICKUPS = new Set(["all", "ready", "picked_up"]);
const FOLLOW_UP_STATUSES = new Set(["contacted", "will_pay", "says_paid", "none"]);
const MAX_NOTE_LENGTH = 500;
const MAX_TITLE_LENGTH = 80;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 120;
const MAX_CURSOR_LENGTH = 512;

function isoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

// Only these fields leave the server: no profile fields beyond name and email, and no hold internals.
function publicOrder(record) {
  return {
    id: String(record._id),
    buyer: record.buyer,
    venmoUsername: record.venmoUsername,
    lines: record.lines.map((line) => ({
      sku: line.sku,
      name: line.name,
      size: line.size,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.quantity * line.unitPriceCents,
    })),
    totalCents: record.totalCents,
    amountReceivedCents: record.amountReceivedCents ?? null,
    // Present only on orders showing their total as received (see toReviewRecords).
    ...(record.amountBeforePaidCents !== undefined && { amountBeforePaidCents: record.amountBeforePaidCents }),
    confirmedAt: new Date(record.confirmedAt).toISOString(),
    status: record.status,
    revision: record.reviewRevision,
    followUp: {
      status: record.followUpStatus,
      updatedBy: record.followUpUpdatedByName,
      updatedAt: isoOrNull(record.followUpUpdatedAt),
    },
    // When the order was handed over, and by which officer; both null until someone marks it picked up.
    pickup: {
      pickedUpAt: isoOrNull(record.pickedUpAt),
      pickedUpBy: record.pickedUpByName ?? null,
    },
    history: record.recentHistory.map((entry) => ({
      actor: entry.actorName,
      at: new Date(entry.at).toISOString(),
      kind: entry.kind,
      from: entry.from,
      to: entry.to,
      ...(entry.title && { title: entry.title }),
      ...(entry.note && { note: entry.note }),
      ...(entry.afterPickup && { afterPickup: true }),
    })),
  };
}

// A stock counter that is missing or too low needs a maintainer, so its facts go to the log. The response stays generic.
function sendReviewFailure(res, error) {
  if (error instanceof ShopReviewError) {
    if (error.details) {
      const { purchaseId, counter, reason, catalogId, sku, quantity, current } = error.details;
      console.error(
        `Shop purchase review failed: ${counter} counter ${reason} (purchase ${purchaseId}, catalogId ${catalogId}, sku ${sku}, needed ${quantity}, current ${current ?? "none"})`,
      );
    }
    return sendError(res, error.status, error.message);
  }
  // Log the failure kind only; order and buyer details stay out of logs.
  console.error("Shop purchase review failed:", error?.name ?? "Error", error?.code ?? "unknown");
  return sendError(res, 500, "Unable to update orders right now. Please try again.");
}

// The pickup board's fields: the buyer's names for the Husky Card check, the Venmo name, the items with sizes, and
// the revision a pickup change must send. Payment and contact details stay out.
function pickupOrder(record) {
  return {
    id: String(record._id),
    revision: record.reviewRevision,
    status: record.status,
    venmoUsername: record.venmoUsername,
    buyer: record.buyer,
    lines: record.lines.map((line) => ({ sku: line.sku, name: line.name, size: line.size, quantity: line.quantity })),
  };
}

// Returns the list filters, or { error } naming the invalid one. Repeated parameters are invalid.
function readListQuery(query) {
  const values = {};
  for (const name of ["status", "balance", "followUp", "pickup", "q", "limit", "cursor"]) {
    const value = query[name];
    if (value !== undefined && typeof value !== "string") {
      return { error: `${name} must be given once.` };
    }
    values[name] = value;
  }

  const status = values.status ?? "pending";
  if (status !== "all" && !STATUSES.has(status)) {
    return { error: "status must be pending, paid, not_paid, refunded, or all." };
  }
  const balance = values.balance ?? "all";
  if (!BALANCES.has(balance)) {
    return { error: "balance must be all or short." };
  }
  const followUp = values.followUp ?? "all";
  if (!FOLLOW_UPS.has(followUp)) {
    return { error: "followUp must be all, awaiting, or none." };
  }
  const pickup = values.pickup ?? "all";
  if (!PICKUPS.has(pickup)) {
    return { error: "pickup must be all, ready, or picked_up." };
  }
  const q = (values.q ?? "").trim();
  if (q.length > MAX_SEARCH_LENGTH) {
    return { error: `Search must be ${MAX_SEARCH_LENGTH} characters or fewer.` };
  }
  const limit = values.limit === undefined ? DEFAULT_PAGE_SIZE : Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    return { error: `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}.` };
  }
  const cursor = values.cursor || undefined;
  if (cursor !== undefined && cursor.length > MAX_CURSOR_LENGTH) {
    return { error: "This page of results is out of date. Search again." };
  }
  return { filters: { status, balance, followUp, pickup, q, limit, cursor } };
}

function isRevision(value) {
  return Number.isInteger(value) && value >= 0;
}

/*
 * @behavior Factory creating the officer purchase review routes, mounted inside the shop router.
 * @param options.reviewStore — review persistence functions; defaults to the MongoDB-backed store
 * @param options.now — clock function returning the current timestamp in milliseconds
 * @returns Express router instance
 */
export function createShopReviewRouter({ reviewStore = defaultReviewStore, now = Date.now } = {}) {
  const router = express.Router();
  const requireReviewer = requirePermission("shop.purchases.review");

  router.use("/purchases", (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });

  router.get("/purchases", requireReviewer, async (req, res) => {
    const { filters, error } = readListQuery(req.query);
    if (error) {
      return sendError(res, 400, error);
    }
    try {
      const { purchases, nextCursor } = await reviewStore.listPurchases(req.models, filters);
      return sendSuccess(res, { purchases: purchases.map(publicOrder), nextCursor });
    } catch (failure) {
      return sendReviewFailure(res, failure);
    }
  });

  router.get("/purchases/counts", requireReviewer, async (req, res) => {
    try {
      const { counts, totals } = await reviewStore.countPurchases(req.models);
      return sendSuccess(res, { counts, totals });
    } catch (error) {
      return sendReviewFailure(res, error);
    }
  });

  // Registered before /purchases/:purchaseId so "pickup" is not read as an order id.
  router.get("/purchases/pickup", requireReviewer, async (req, res) => {
    try {
      const board = await reviewStore.listReadyForPickup(req.models, { limit: PICKUP_BOARD_LIMIT });
      return sendSuccess(res, {
        orders: board.orders.map(pickupOrder),
        truncated: board.truncated,
        limit: PICKUP_BOARD_LIMIT,
        counts: board.counts,
      });
    } catch (error) {
      return sendReviewFailure(res, error);
    }
  });

  router.get("/purchases/:purchaseId", requireReviewer, async (req, res) => {
    if (!OBJECT_ID_PATTERN.test(req.params.purchaseId)) {
      return sendError(res, 404, "Order not found.");
    }
    try {
      return sendSuccess(res, { purchase: publicOrder(await reviewStore.getPurchase(req.models, req.params.purchaseId)) });
    } catch (error) {
      return sendReviewFailure(res, error);
    }
  });

  router.patch("/purchases/:purchaseId/payment", requireReviewer, async (req, res) => {
    if (!OBJECT_ID_PATTERN.test(req.params.purchaseId)) {
      return sendError(res, 404, "Order not found.");
    }
    const { status, note, expectedRevision } = req.body ?? {};
    if (!STATUSES.has(status) || !isRevision(expectedRevision)) {
      return sendError(res, 400, "Send a payment status and the order's current revision.");
    }
    if (note !== undefined && (typeof note !== "string" || note.trim().length > MAX_NOTE_LENGTH)) {
      return sendError(res, 400, `A note must be text of ${MAX_NOTE_LENGTH} characters or fewer.`);
    }
    try {
      const record = await reviewStore.setPaymentStatus(req.models, {
        purchaseId: req.params.purchaseId,
        status,
        note: note?.trim() || undefined,
        expectedRevision,
        changedBy: req.session.userId,
        nowMs: now(),
      });
      return sendSuccess(res, { purchase: publicOrder(record) });
    } catch (error) {
      return sendReviewFailure(res, error);
    }
  });

  router.patch("/purchases/:purchaseId/follow-up", requireReviewer, async (req, res) => {
    if (!OBJECT_ID_PATTERN.test(req.params.purchaseId)) {
      return sendError(res, 404, "Order not found.");
    }
    const { followUpStatus, note, expectedRevision } = req.body ?? {};
    if (!FOLLOW_UP_STATUSES.has(followUpStatus) || !isRevision(expectedRevision)) {
      return sendError(res, 400, "Send followUpStatus as contacted, will_pay, says_paid, or none and the order's current revision.");
    }
    if (note !== undefined && (typeof note !== "string" || note.trim().length > MAX_NOTE_LENGTH)) {
      return sendError(res, 400, `A note must be text of ${MAX_NOTE_LENGTH} characters or fewer.`);
    }
    try {
      const record = await reviewStore.setFollowUp(req.models, {
        purchaseId: req.params.purchaseId,
        followUpStatus,
        note: note?.trim() || undefined,
        expectedRevision,
        changedBy: req.session.userId,
        nowMs: now(),
      });
      return sendSuccess(res, { purchase: publicOrder(record) });
    } catch (error) {
      return sendReviewFailure(res, error);
    }
  });

  router.post("/purchases/:purchaseId/notes", requireReviewer, async (req, res) => {
    if (!OBJECT_ID_PATTERN.test(req.params.purchaseId)) {
      return sendError(res, 404, "Order not found.");
    }
    const { title, note, expectedRevision } = req.body ?? {};
    const topic = typeof title === "string" ? title.trim() : "";
    if (!topic || topic.length > MAX_TITLE_LENGTH || !isRevision(expectedRevision)) {
      return sendError(res, 400, `Send a topic of 1 to ${MAX_TITLE_LENGTH} characters and the order's current revision.`);
    }
    if (note !== undefined && (typeof note !== "string" || note.trim().length > MAX_NOTE_LENGTH)) {
      return sendError(res, 400, `A note must be text of ${MAX_NOTE_LENGTH} characters or fewer.`);
    }
    try {
      const record = await reviewStore.addNote(req.models, {
        purchaseId: req.params.purchaseId,
        title: topic,
        note: note?.trim() || undefined,
        expectedRevision,
        changedBy: req.session.userId,
        nowMs: now(),
      });
      return sendSuccess(res, { purchase: publicOrder(record) });
    } catch (error) {
      return sendReviewFailure(res, error);
    }
  });

  router.patch("/purchases/:purchaseId/pickup", requireReviewer, async (req, res) => {
    if (!OBJECT_ID_PATTERN.test(req.params.purchaseId)) {
      return sendError(res, 404, "Order not found.");
    }
    const { pickedUp, expectedRevision } = req.body ?? {};
    if (typeof pickedUp !== "boolean" || !isRevision(expectedRevision)) {
      return sendError(res, 400, "Send pickedUp as true or false and the order's current revision.");
    }
    try {
      const record = await reviewStore.setPickup(req.models, {
        purchaseId: req.params.purchaseId,
        pickedUp,
        expectedRevision,
        changedBy: req.session.userId,
        nowMs: now(),
      });
      return sendSuccess(res, { purchase: publicOrder(record) });
    } catch (error) {
      return sendReviewFailure(res, error);
    }
  });

  router.patch("/purchases/:purchaseId/amount-received", requireReviewer, async (req, res) => {
    if (!OBJECT_ID_PATTERN.test(req.params.purchaseId)) {
      return sendError(res, 404, "Order not found.");
    }
    const { amountReceivedCents, expectedRevision } = req.body ?? {};
    if (!Number.isSafeInteger(amountReceivedCents) || amountReceivedCents < 0 || !isRevision(expectedRevision)) {
      return sendError(res, 400, "Send the amount received in whole cents and the order's current revision.");
    }
    try {
      const record = await reviewStore.setAmountReceived(req.models, {
        purchaseId: req.params.purchaseId,
        amountReceivedCents,
        expectedRevision,
        changedBy: req.session.userId,
        nowMs: now(),
      });
      return sendSuccess(res, { purchase: publicOrder(record) });
    } catch (error) {
      return sendReviewFailure(res, error);
    }
  });

  return router;
}
