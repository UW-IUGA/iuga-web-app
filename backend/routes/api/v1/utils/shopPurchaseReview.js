/*
Purpose: Officer review of accepted manual Venmo purchases: bounded oldest-first listing with buyer
         search, one-order reads, and revision-checked payment and follow-up decisions. Payment changes
         that return or retake stock adjust the counters in the same transaction as the purchase, so a
         decision and its stock effect commit together or not at all.
Authentication/Authorization Requirements: N/A (called by the shop review controller after its permission check)
Expected Request Information: req.models, validated filters or decision fields, the officer's user id, and nowMs.
Expected Response Information: review records, or throws ShopReviewError with an HTTP status.

Requires a MongoDB replica set for payment decisions. Transactions are unavailable on a standalone server.
*/

import mongoose from "mongoose";
import { DROP_UNIT_CAP } from "./shopHolds.js";
import { currentLimits, limitFor } from "./shopLimits.js";
import { withTransaction } from "./shopCheckoutStore.js";

const RECENT_HISTORY_LIMIT = 20;
// The pickup board lists every ready order in one response; past this many, the board says it was cut short.
export const PICKUP_BOARD_LIMIT = 1000;
const CONFLICT_MESSAGE = "Another officer updated this order. Review the latest details before choosing an action.";
const COUNTER_MESSAGE =
  "Stock counts for this order are missing or inconsistent. Nothing changed; ask a maintainer to check the shop counters.";
const PICKED_UP_REASON_MESSAGE = "This order was picked up, so the change needs a reason. Nothing changed.";

const STATUS_LABELS = { pending: "Pending", paid: "Paid", not_paid: "Not paid", refunded: "Refunded" };

// Pending and Paid orders hold their items; Not paid and Refunded orders have returned them to stock. Any
// status can change to any other, so an officer can correct a mistake. Stock moves only when a change
// crosses between the two groups.
export const HOLDS_STOCK = new Set(["pending", "paid"]);

// `details` carries facts for the server log only; the response sends just the status and message.
export class ShopReviewError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = "ShopReviewError";
    this.status = status;
    this.details = details;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function displayName(user) {
  if (!user) return null;
  const fullName = [user.uFirstName, user.uLastName].filter(Boolean).join(" ");
  return user.uDisplayName || fullName || null;
}

// A cursor carries the last row's position and the query it belongs to, so it cannot continue a different search.
function queryKey({ status, balance, followUp, pickup, q }) {
  return JSON.stringify([status, balance, followUp, pickup, q]);
}

function encodeCursor(row, query) {
  return Buffer.from(JSON.stringify({
    d: new Date(row.confirmedAt).toISOString(),
    i: String(row._id),
    k: queryKey(query),
  })).toString("base64url");
}

function decodeCursor(cursor, query) {
  try {
    const { d, i, k } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const confirmedAt = new Date(d);
    if (k !== queryKey(query) || Number.isNaN(confirmedAt.getTime()) || !mongoose.isObjectIdOrHexString(i)) {
      throw new Error("mismatched cursor");
    }
    return { confirmedAt, id: new mongoose.Types.ObjectId(i) };
  } catch {
    throw new ShopReviewError(400, "This page of results is out of date. Search again.");
  }
}

// The buyer as officers see them: the name and email, plus the first and last name for the Husky Card check and
// the preferred name when the student set one. Phone numbers are added only where a single order is read.
function buyerView(profile) {
  return {
    id: String(profile._id),
    name: displayName(profile),
    email: profile.uEmail ?? null,
    firstName: profile.uFirstName ?? null,
    lastName: profile.uLastName ?? null,
    preferredName: profile.uDisplayName ?? null,
  };
}

function buyerLookup(models) {
  return [
    {
      $lookup: {
        from: models.Users.collection.name,
        localField: "userId",
        foreignField: "_id",
        pipeline: [{ $project: { uFirstName: 1, uLastName: 1, uDisplayName: 1, uEmail: 1 } }],
        as: "buyerProfile",
      },
    },
    { $addFields: { buyerProfile: { $arrayElemAt: ["$buyerProfile", 0] } } },
  ];
}

const REVIEW_PROJECTION = {
  holdId: 0,
  catalogVersion: 0,
  reviewHistory: 0,
  createdAt: 0,
  updatedAt: 0,
  __v: 0,
};

// Orders saved before follow-up statuses existed only marked "awaiting a reply", which means contacted.
function legacyFollowUp(value) {
  return value === "awaiting" ? "contacted" : value;
}

function currentFollowUp(purchase) {
  return purchase.followUpStatus ?? (purchase.awaitingStudentReply === true ? "contacted" : null);
}

// Turns aggregation rows into review records: legacy defaults, a projected buyer, recent history with
// officer names, and for orders that show their total as received the amount a move to Pending or Not paid
// restores. Officer names come from one batch read;
// a missing profile shows its saved id.
async function toReviewRecords(models, rows) {
  const actorIds = new Set();
  for (const row of rows) {
    for (const entry of row.recentHistory ?? []) actorIds.add(String(entry.actorId));
    if (row.followUpUpdatedBy) actorIds.add(String(row.followUpUpdatedBy));
    if (row.pickedUpBy) actorIds.add(String(row.pickedUpBy));
  }
  const actors = actorIds.size === 0 ? [] : await models.Users.find(
    { _id: { $in: [...actorIds] } },
    { uFirstName: 1, uLastName: 1, uDisplayName: 1 },
  ).lean();
  const names = new Map(actors.map((actor) => [String(actor._id), displayName(actor)]));
  const nameFor = (id) => (id ? names.get(String(id)) ?? String(id) : null);

  return rows.map(({ buyerProfile, recentHistory, amountHistory, ...row }) => ({
    ...row,
    reviewRevision: row.reviewRevision ?? 0,
    amountReceivedCents: row.amountReceivedCents ?? null,
    // Only an order showing its total as received (Paid, or Refunded after being paid) gets an amount restored
    // when it moves to Pending or Not paid, so only those records carry it.
    ...(row.amountReceivedCents >= row.totalCents && { amountBeforePaidCents: amountBeforePaid(row.totalCents, amountHistory) }),
    awaitingStudentReply: row.awaitingStudentReply === true,
    followUpStatus: currentFollowUp(row),
    followUpUpdatedBy: row.followUpUpdatedBy ?? null,
    followUpUpdatedAt: row.followUpUpdatedAt ?? null,
    followUpUpdatedByName: nameFor(row.followUpUpdatedBy),
    pickedUpAt: row.pickedUpAt ?? null,
    pickedUpBy: row.pickedUpBy ?? null,
    pickedUpByName: nameFor(row.pickedUpBy),
    buyer: buyerProfile ? buyerView(buyerProfile) : null,
    recentHistory: (recentHistory ?? []).map((entry) => ({
      ...entry,
      ...(entry.kind === "follow_up" && { from: legacyFollowUp(entry.from), to: legacyFollowUp(entry.to) }),
      actorName: nameFor(entry.actorId),
    })),
  }));
}

function reviewFields() {
  return [
    {
      $addFields: {
        recentHistory: { $slice: [{ $ifNull: ["$reviewHistory", []] }, -RECENT_HISTORY_LIMIT] },
        // Only amount entries come back for the restored-amount rule, so a long history stays cheap to read.
        amountHistory: {
          $filter: {
            input: { $ifNull: ["$reviewHistory", []] },
            as: "entry",
            cond: { $eq: ["$$entry.kind", "amount_received"] },
          },
        },
      },
    },
    { $project: REVIEW_PROJECTION },
  ];
}

/*
 * @behavior List purchases oldest first (confirmation time, then id) in bounded pages. Filters and search
 *           apply before the page limit, so a search finds matching orders beyond the first page. Search is
 *           literal and case-insensitive over the buyer's name and email and the purchase's saved Venmo
 *           username. Orders whose buyer profile no longer exists are kept, with buyer null.
 * @param status — pending | paid | not_paid | refunded | all
 * @param balance — all | short, where short keeps orders whose recorded amount received is below the total
 * @param followUp — all | awaiting | none
 * @param pickup — all | ready | picked_up, where ready keeps orders not marked picked up and picked_up keeps
 *        orders that were
 * @param q — search text, "" for none
 * @param limit — page size
 * @param cursor — nextCursor from the previous page of the same query, or undefined
 * @returns { purchases: review records, nextCursor: string | null }
 * @throws ShopReviewError 400 when the cursor is malformed or belongs to a different query
 */
export async function listPurchases(models, { status, balance = "all", followUp, pickup = "all", q, limit, cursor }) {
  const query = { status, balance, followUp, pickup, q };
  const match = {};
  if (status !== "all") match.status = status;
  if (balance === "short") Object.assign(match, SHORT_PAYMENT);
  if (followUp === "awaiting") match.awaitingStudentReply = true;
  if (followUp === "none") match.awaitingStudentReply = { $ne: true };
  if (pickup === "ready") match.pickedUpAt = null;
  if (pickup === "picked_up") match.pickedUpAt = { $ne: null };
  if (cursor) {
    const after = decodeCursor(cursor, query);
    match.$or = [
      { confirmedAt: { $gt: after.confirmedAt } },
      { confirmedAt: after.confirmedAt, _id: { $gt: after.id } },
    ];
  }

  const pipeline = [{ $match: match }, { $sort: { confirmedAt: 1, _id: 1 } }];
  if (q) {
    // Name and email live on the buyer's profile, so join before limiting.
    const pattern = new RegExp(escapeRegex(q), "i");
    pipeline.push(
      ...buyerLookup(models),
      {
        $addFields: {
          buyerFullName: {
            $concat: [{ $ifNull: ["$buyerProfile.uFirstName", ""] }, " ", { $ifNull: ["$buyerProfile.uLastName", ""] }],
          },
        },
      },
      {
        $match: {
          $or: [
            { venmoUsername: pattern },
            { "buyerProfile.uEmail": pattern },
            { "buyerProfile.uDisplayName": pattern },
            { buyerFullName: pattern },
          ],
        },
      },
      { $limit: limit + 1 },
      { $project: { buyerFullName: 0 } },
    );
  } else {
    pipeline.push({ $limit: limit + 1 }, ...buyerLookup(models));
  }
  pipeline.push(...reviewFields());

  const rows = await models.ShopPurchases.aggregate(pipeline);
  const page = rows.slice(0, limit);
  return {
    purchases: await toReviewRecords(models, page),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1], query) : null,
  };
}

// A Pending or Not paid order with a recorded amount below its total: money is still owed. Paid raises the
// amount to the total, and a Refunded order may keep a partial amount but owes nothing, so neither counts.
// The status check sits inside $expr so it combines with, rather than replaces, a list's own status filter.
const SHORT_PAYMENT = {
  amountReceivedCents: { $ne: null },
  $expr: {
    $and: [
      { $in: ["$status", ["pending", "not_paid"]] },
      { $lt: ["$amountReceivedCents", "$totalCents"] },
    ],
  },
};

/*
 * @behavior Count purchases for the filter pills and total the money for the overview: what Pending orders owe, and
 *           what Paid orders received. Ignores search. Paid orders are split by pickup: ready (not yet picked up) and
 *           picked_up. Still owed is expected minus received; a Pending order never holds an amount that covers its
 *           total, because recording one marks the order paid. Confirmed is the money received on Paid orders only,
 *           so a refunded order leaves it; a Paid order saved before amounts were recorded counts its total.
 *           says_paid counts open follow-ups where the student says they already paid.
 * @returns { counts: { pending, paid, ready, picked_up, not_paid, refunded, all, short, awaiting, says_paid },
 *            totals: { expectedCents, receivedCents, owedCents, pendingOrders, receivedOrders, confirmedCents } }
 */
export async function countPurchases(models) {
  const [result] = await models.ShopPurchases.aggregate([
    {
      $facet: {
        byStatus: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        short: [{ $match: SHORT_PAYMENT }, { $count: "count" }],
        awaiting: [{ $match: { awaitingStudentReply: true } }, { $count: "count" }],
        saysPaid: [{ $match: { awaitingStudentReply: true, followUpStatus: "says_paid" } }, { $count: "count" }],
        confirmed: [
          { $match: { status: "paid" } },
          { $group: { _id: null, cents: { $sum: { $ifNull: ["$amountReceivedCents", "$totalCents"] } } } },
        ],
        ready: [{ $match: { status: "paid", pickedUpAt: null } }, { $count: "count" }],
        pickedUp: [{ $match: { status: "paid", pickedUpAt: { $ne: null } } }, { $count: "count" }],
        pending: [
          { $match: { status: "pending" } },
          {
            $group: {
              _id: null,
              expectedCents: { $sum: "$totalCents" },
              receivedCents: { $sum: { $ifNull: ["$amountReceivedCents", 0] } },
              receivedOrders: { $sum: { $cond: [{ $gt: [{ $ifNull: ["$amountReceivedCents", 0] }, 0] }, 1, 0] } },
            },
          },
        ],
      },
    },
  ]);
  const counts = {
    pending: 0,
    paid: 0,
    ready: result.ready[0]?.count ?? 0,
    picked_up: result.pickedUp[0]?.count ?? 0,
    not_paid: 0,
    refunded: 0,
    all: 0,
    short: result.short[0]?.count ?? 0,
    awaiting: result.awaiting[0]?.count ?? 0,
    says_paid: result.saysPaid[0]?.count ?? 0,
  };
  for (const { _id: status, count } of result.byStatus) {
    if (status in STATUS_LABELS) counts[status] = count;
    counts.all += count;
  }
  const { expectedCents = 0, receivedCents = 0, receivedOrders = 0 } = result.pending[0] ?? {};
  return {
    counts,
    totals: {
      expectedCents,
      receivedCents,
      owedCents: expectedCents - receivedCents,
      pendingOrders: counts.pending,
      receivedOrders,
      confirmedCents: result.confirmed[0]?.cents ?? 0,
    },
  };
}

/*
 * @behavior Read one purchase as a review record, for the order's detail view and for refreshing it after
 *           a decision, a conflict, or a lost response. Unlike the list, it includes the buyer's private
 *           phone number so an officer can follow up; null when the buyer has none.
 * @throws ShopReviewError 404 when the purchase does not exist
 */
export async function getPurchase(models, purchaseId) {
  const rows = await models.ShopPurchases.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(String(purchaseId)) } },
    ...buyerLookup(models),
    ...reviewFields(),
  ]);
  if (rows.length === 0) {
    throw new ShopReviewError(404, "Order not found.");
  }
  const [record] = await toReviewRecords(models, rows);
  if (record.buyer) {
    const contact = await models.Users.findById(record.buyer.id, { uPhoneNumber: 1 }).select("+uPhoneNumber").lean();
    record.buyer.phone = contact?.uPhoneNumber ?? null;
  }
  return record;
}

/*
 * @behavior The pickup board: every order ready for pickup (Paid and not yet picked up) in purchase order, oldest
 *           first, up to limit, with counts for the progress line. The page sorts the board by last or first name,
 *           so the store keeps the purchase order. Ready orders are a bounded set and the status index serves the
 *           query, so no new index is needed; the picked-up count reads the whole purchases collection, which is
 *           small for a shop run.
 * @param limit — most orders to return; one more is read to tell whether the board was cut short
 * @returns { orders: buyer and order fields for the board, truncated: boolean, counts: { ready, pickedUp } }
 */
export async function listReadyForPickup(models, { limit }) {
  const ready = { status: "paid", pickedUpAt: null };
  const [rows, readyCount, pickedUpCount] = await Promise.all([
    models.ShopPurchases.aggregate([
      { $match: ready },
      { $sort: { confirmedAt: 1, _id: 1 } },
      { $limit: limit + 1 },
      ...buyerLookup(models),
      { $project: { status: 1, venmoUsername: 1, lines: 1, reviewRevision: 1, buyerProfile: 1 } },
    ]),
    models.ShopPurchases.countDocuments(ready),
    models.ShopPurchases.countDocuments({ pickedUpAt: { $ne: null } }),
  ]);
  const page = rows.slice(0, limit);
  return {
    orders: page.map(({ buyerProfile, ...row }) => ({
      ...row,
      reviewRevision: row.reviewRevision ?? 0,
      buyer: buyerProfile ? buyerView(buyerProfile) : null,
    })),
    truncated: rows.length > limit,
    counts: { ready: readyCount, pickedUp: pickedUpCount },
  };
}

// Purchases saved before review existed have no revision; they match revision 0.
function revisionFilter(expectedRevision) {
  return expectedRevision === 0
    ? { $or: [{ reviewRevision: { $exists: false } }, { reviewRevision: 0 }] }
    : { reviewRevision: expectedRevision };
}

// Quantities per product. Sizes of one product share its counters.
function quantitiesBySku(lines) {
  const totals = new Map();
  for (const line of lines) {
    const entry = totals.get(line.sku) ?? { name: line.name, quantity: 0 };
    entry.quantity += line.quantity;
    totals.set(line.sku, entry);
  }
  return totals;
}

// The 500 for a stock counter that is missing or too low. `row` is the counter as read in the same transaction
// (null when it does not exist), so the log shows what the update saw. Buyer fields are left out on purpose.
function counterError({ counter, purchase, sku, quantity, row, field }) {
  return new ShopReviewError(500, COUNTER_MESSAGE, {
    purchaseId: String(purchase._id),
    counter,
    reason: row ? "too low" : "missing",
    catalogId: String(purchase.catalogId),
    sku,
    quantity,
    current: row?.[field] ?? null,
  });
}

// A picked-up order that moves to any status but Paid has handed its merch back to the drop, so that change needs
// a reason and is marked in history.
function isAfterPickupChange(purchase, status) {
  return Boolean(purchase.pickedUpAt) && status !== "paid";
}

// Returns the order's units to the drop and to the student. Every counter must exist and hold enough units.
async function releaseStock(models, session, purchase) {
  for (const [sku, { quantity }] of quantitiesBySku(purchase.lines)) {
    const stock = await models.ShopCapacity.updateOne(
      { catalogId: purchase.catalogId, sku, reservedUnits: { $gte: quantity } },
      { $inc: { reservedUnits: -quantity } },
      { session },
    );
    if (stock.matchedCount !== 1) {
      const row = await models.ShopCapacity.findOne({ catalogId: purchase.catalogId, sku }).session(session).lean();
      throw counterError({ counter: "drop stock", purchase, sku, quantity, row, field: "reservedUnits" });
    }
    const student = await models.ShopStudentUnits.updateOne(
      { userId: purchase.userId, sku, units: { $gte: quantity } },
      { $inc: { units: -quantity } },
      { session },
    );
    if (student.matchedCount !== 1) {
      const row = await models.ShopStudentUnits.findOne({ userId: purchase.userId, sku }).session(session).lean();
      throw counterError({ counter: "student allowance", purchase, sku, quantity, row, field: "units" });
    }
  }
}

// Takes the order's units again, within the drop cap and the per-student limit checkout uses.
async function retakeStock(models, session, purchase) {
  const limits = await currentLimits(models);
  for (const [sku, { name, quantity }] of quantitiesBySku(purchase.lines)) {
    const stock = await models.ShopCapacity.updateOne(
      { catalogId: purchase.catalogId, sku, reservedUnits: { $lte: DROP_UNIT_CAP - quantity } },
      { $inc: { reservedUnits: quantity } },
      { session },
    );
    if (stock.matchedCount !== 1) {
      const exists = await models.ShopCapacity.exists({ catalogId: purchase.catalogId, sku }).session(session);
      throw exists
        ? new ShopReviewError(409, `Not enough ${name} left in this drop to take this order's items again. Nothing changed.`)
        : counterError({ counter: "drop stock", purchase, sku, quantity, row: null, field: "reservedUnits" });
    }
    const limit = limitFor(limits, sku);
    const student = await models.ShopStudentUnits.updateOne(
      { userId: purchase.userId, sku, units: { $lte: limit - quantity } },
      { $inc: { units: quantity } },
      { session },
    );
    if (student.matchedCount !== 1) {
      const exists = await models.ShopStudentUnits.exists({ userId: purchase.userId, sku }).session(session);
      throw exists
        ? new ShopReviewError(409, `${name} is limited to ${limit} per student, so this order can't take its items again. Nothing changed.`)
        : counterError({ counter: "student allowance", purchase, sku, quantity, row: null, field: "units" });
    }
  }
}

// History text for an amount received: whole cents, or "none" before anything was recorded.
function amountText(cents) {
  return cents == null ? "none" : String(cents);
}

// The amount received before the order first reached its total, which moving it to Pending or Not paid restores.
// That is the "from" of the newest amount entry that brought it to the total. Null when nothing was recorded
// then, when no such entry exists, or when that amount would still cover the total. The history may be the
// whole review history or only its amount entries.
function amountBeforePaid(totalCents, history) {
  const reachedTotal = history.findLast(
    (entry) => entry.kind === "amount_received" && Number(entry.to) >= totalCents,
  );
  if (!reachedTotal || reachedTotal.from === "none") return null;
  const restored = Number(reachedTotal.from);
  return restored < totalCents ? restored : null;
}

// Loads a purchase inside the transaction and checks the officer reviewed its current revision.
async function purchaseAtRevision(models, session, purchaseId, expectedRevision) {
  const purchase = await models.ShopPurchases.findById(purchaseId, null, { session }).lean();
  if (!purchase) {
    throw new ShopReviewError(404, "Order not found.");
  }
  if ((purchase.reviewRevision ?? 0) !== expectedRevision) {
    throw new ShopReviewError(409, CONFLICT_MESSAGE);
  }
  return purchase;
}

// Applies a payment change inside the caller's transaction: adjusts stock and returns the purchase fields
// and history entries to save with it. Marking paid records the full total as received unless more was
// already recorded. A Pending or Not paid order never shows its total as received, so moving one there
// restores the amount received from before the order reached its total. Any change clears an active
// follow-up, and a reason is saved on the payment entry.
async function paymentChange(models, session, purchase, status, actorId, at, note) {
  const heldStock = HOLDS_STOCK.has(purchase.status);
  if (heldStock && !HOLDS_STOCK.has(status)) await releaseStock(models, session, purchase);
  if (!heldStock && HOLDS_STOCK.has(status)) await retakeStock(models, session, purchase);

  const changes = { status };
  const history = [];
  const received = purchase.amountReceivedCents ?? null;
  if (status === "paid" && (received ?? 0) < purchase.totalCents) {
    changes.amountReceivedCents = purchase.totalCents;
    history.push({
      actorId, at, kind: "amount_received", from: amountText(received), to: String(purchase.totalCents),
    });
  }
  if ((status === "pending" || status === "not_paid") && received != null && received >= purchase.totalCents) {
    const restored = amountBeforePaid(purchase.totalCents, purchase.reviewHistory ?? []);
    if (restored !== received) {
      changes.amountReceivedCents = restored;
      history.push({
        actorId, at, kind: "amount_received", from: amountText(purchase.amountReceivedCents), to: amountText(restored),
      });
    }
  }
  history.push({
    actorId,
    at,
    kind: "payment",
    from: purchase.status,
    to: status,
    ...(note && { note }),
    ...(isAfterPickupChange(purchase, status) && { afterPickup: true }),
  });
  const followUp = currentFollowUp(purchase);
  if (followUp) {
    history.push({ actorId, at, kind: "follow_up", from: followUp, to: "none" });
    Object.assign(changes, { awaitingStudentReply: false, followUpStatus: null, followUpUpdatedBy: actorId, followUpUpdatedAt: at });
  }
  return { changes, history };
}

// Saves review changes only if nobody changed the purchase's status or revision since it was read.
async function saveReview(models, session, purchase, expectedRevision, changes, history) {
  const updated = await models.ShopPurchases.updateOne(
    { _id: purchase._id, status: purchase.status, ...revisionFilter(expectedRevision) },
    { $set: { ...changes, reviewRevision: expectedRevision + 1 }, $push: { reviewHistory: { $each: history } } },
    { session },
  );
  if (updated.matchedCount !== 1) {
    throw new ShopReviewError(409, CONFLICT_MESSAGE);
  }
}

/*
 * @behavior Change a purchase's payment status after the officer's manual Venmo check, or to correct a
 *           mistake: any status can change to any other. Moving from Pending or Paid to Not paid or Refunded
 *           returns stock and allowance once; moving back retakes all of it or fails unchanged; other changes
 *           keep stock. Marking paid records the full total as received unless more was already recorded.
 *           Moving an order that shows its total as received to Pending or Not paid restores the amount
 *           received from before it reached its total, or nothing recorded when that amount is unknown. A
 *           change clears an active follow-up and
 *           records everything in history, all in one transaction. The optional note is saved on the payment
 *           entry. Requesting the current status with the current revision changes nothing.
 *           A picked-up order moved to any status but Paid needs a note, and its payment entry is marked
 *           afterPickup. The pickup mark stays. Each such change writes one audit line to the server log, with
 *           no buyer details, once it has been saved.
 * @param note — trimmed reason for the change, or undefined
 * @throws ShopReviewError 404 missing purchase; 409 stale revision, a picked-up order changed without a note, or
 *         no room to retake; 500 missing or inconsistent counters (nothing is changed)
 */
export async function setPaymentStatus(models, { purchaseId, status, note, expectedRevision, actorId, nowMs }) {
  const afterPickup = await withTransaction(models, async (session) => {
    const purchase = await purchaseAtRevision(models, session, purchaseId, expectedRevision);
    if (purchase.status === status) {
      return null;
    }
    if (isAfterPickupChange(purchase, status) && !note) {
      throw new ShopReviewError(409, PICKED_UP_REASON_MESSAGE);
    }
    const { changes, history } = await paymentChange(models, session, purchase, status, actorId, new Date(nowMs), note);
    await saveReview(models, session, purchase, expectedRevision, changes, history);
    return isAfterPickupChange(purchase, status) ? { from: purchase.status, to: status } : null;
  });
  if (afterPickup) {
    console.warn(`Shop purchase changed after pickup: purchase ${String(purchaseId)}, ${afterPickup.from} → ${afterPickup.to}`);
  }
  return getPurchase(models, purchaseId);
}

/*
 * @behavior Record the total amount the officer saw arrive in Venmo for a Pending or Not paid order.
 *           Once it covers the order total the order becomes Paid in the same transaction, as if marked
 *           paid (a Not paid order retakes its stock or nothing changes). A smaller amount keeps the status.
 *           Requesting the current amount with the current revision changes nothing.
 * @throws ShopReviewError 404 missing purchase; 409 stale revision, a Paid or Refunded order, or no room to
 *         retake; 500 missing or inconsistent counters (nothing is changed)
 */
export async function setAmountReceived(models, { purchaseId, amountReceivedCents, expectedRevision, actorId, nowMs }) {
  await withTransaction(models, async (session) => {
    const purchase = await purchaseAtRevision(models, session, purchaseId, expectedRevision);
    if ((purchase.amountReceivedCents ?? null) === amountReceivedCents) {
      return;
    }
    if (purchase.status !== "pending" && purchase.status !== "not_paid") {
      throw new ShopReviewError(409, `The amount received can't change on a ${STATUS_LABELS[purchase.status]} order.`);
    }
    const at = new Date(nowMs);
    let changes = { amountReceivedCents };
    const history = [{
      actorId, at, kind: "amount_received", from: amountText(purchase.amountReceivedCents), to: String(amountReceivedCents),
    }];
    if (amountReceivedCents >= purchase.totalCents) {
      const paid = await paymentChange(models, session, { ...purchase, amountReceivedCents }, "paid", actorId, at);
      changes = { ...changes, ...paid.changes };
      history.push(...paid.history);
    }
    await saveReview(models, session, purchase, expectedRevision, changes, history);
  });
  return getPurchase(models, purchaseId);
}

/*
 * @behavior Logs where follow-up with the student stands, with the officer's optional note. Each log is
 *           its own history entry, so reaching out again is recorded even when the status stays
 *           contacted. Clearing an order with no follow-up and no note records nothing. Never touches
 *           payment status, amount received, or stock.
 * @param followUpStatus — contacted | will_pay | says_paid | none
 * @param note — trimmed note text, or undefined
 * @throws ShopReviewError 404 when the purchase does not exist, 409 when the revision is stale
 */
export async function setFollowUp(models, { purchaseId, followUpStatus, note, expectedRevision, actorId, nowMs }) {
  const purchase = await models.ShopPurchases.findById(
    purchaseId,
    { reviewRevision: 1, awaitingStudentReply: 1, followUpStatus: 1 },
  ).lean();
  if (!purchase) {
    throw new ShopReviewError(404, "Order not found.");
  }
  if ((purchase.reviewRevision ?? 0) !== expectedRevision) {
    throw new ShopReviewError(409, CONFLICT_MESSAGE);
  }
  const current = currentFollowUp(purchase) ?? "none";
  if (current === "none" && followUpStatus === "none" && !note) {
    return getPurchase(models, purchaseId);
  }
  const at = new Date(nowMs);
  const open = followUpStatus !== "none";
  const updated = await models.ShopPurchases.updateOne(
    { _id: purchase._id, ...revisionFilter(expectedRevision) },
    {
      $set: {
        awaitingStudentReply: open,
        followUpStatus: open ? followUpStatus : null,
        followUpUpdatedBy: actorId,
        followUpUpdatedAt: at,
        reviewRevision: expectedRevision + 1,
      },
      $push: {
        reviewHistory: { actorId, at, kind: "follow_up", from: current, to: followUpStatus, ...(note && { note }) },
      },
    },
  );
  if (updated.matchedCount !== 1) {
    throw new ShopReviewError(409, CONFLICT_MESSAGE);
  }
  return getPurchase(models, purchaseId);
}

/*
 * @behavior Marks a paid order as handed over at pickup, or clears that mark. Marking records when and by which
 *           officer, and clearing removes both; each change is one history entry. Only a paid order can be
 *           marked picked up, but a mark can always be cleared. Asking for the state the order already has, at
 *           its current revision, changes nothing. Never changes payment status, amount received, follow-up,
 *           or stock.
 * @param pickedUp — true to mark picked up, false to clear the mark
 * @throws ShopReviewError 404 when the purchase does not exist; 409 when the revision is stale, or when a
 *         purchase that is not paid is marked picked up
 */
export async function setPickup(models, { purchaseId, pickedUp, expectedRevision, actorId, nowMs }) {
  const purchase = await models.ShopPurchases.findById(
    purchaseId,
    { reviewRevision: 1, status: 1, pickedUpAt: 1 },
  ).lean();
  if (!purchase) {
    throw new ShopReviewError(404, "Order not found.");
  }
  if ((purchase.reviewRevision ?? 0) !== expectedRevision) {
    throw new ShopReviewError(409, CONFLICT_MESSAGE);
  }
  if (Boolean(purchase.pickedUpAt) === pickedUp) {
    return getPurchase(models, purchaseId);
  }
  if (pickedUp && purchase.status !== "paid") {
    throw new ShopReviewError(409, "Only paid orders can be picked up.");
  }
  const at = new Date(nowMs);
  const updated = await models.ShopPurchases.updateOne(
    { _id: purchase._id, ...revisionFilter(expectedRevision) },
    {
      $set: {
        pickedUpAt: pickedUp ? at : null,
        pickedUpBy: pickedUp ? actorId : null,
        reviewRevision: expectedRevision + 1,
      },
      $push: {
        reviewHistory: {
          actorId,
          at,
          kind: "pickup",
          from: pickedUp ? "not_picked_up" : "picked_up",
          to: pickedUp ? "picked_up" : "not_picked_up",
        },
      },
    },
  );
  if (updated.matchedCount !== 1) {
    throw new ShopReviewError(409, CONFLICT_MESSAGE);
  }
  return getPurchase(models, purchaseId);
}

/*
 * @behavior Adds an officer's own entry to the order's activity: a topic and an optional description. It
 *           changes nothing else, but still takes the next revision, so an officer acting on an older view
 *           sees the new entry before deciding.
 * @param title — trimmed topic text
 * @param note — trimmed description, or undefined
 * @throws ShopReviewError 404 when the purchase does not exist, 409 when the revision is stale
 */
export async function addNote(models, { purchaseId, title, note, expectedRevision, actorId, nowMs }) {
  const purchase = await models.ShopPurchases.findById(purchaseId, { reviewRevision: 1 }).lean();
  if (!purchase) {
    throw new ShopReviewError(404, "Order not found.");
  }
  const updated = await models.ShopPurchases.updateOne(
    { _id: purchase._id, ...revisionFilter(expectedRevision) },
    {
      $set: { reviewRevision: expectedRevision + 1 },
      $push: { reviewHistory: { actorId, at: new Date(nowMs), kind: "note", title, ...(note && { note }) } },
    },
  );
  if (updated.matchedCount !== 1) {
    throw new ShopReviewError(409, CONFLICT_MESSAGE);
  }
  return getPurchase(models, purchaseId);
}
