/*
Purpose: Persist manual Venmo shop holds and purchases in MongoDB transactions. Stock and per-student
         counts change only through conditional updates on counter documents, so two holds cannot both
         take the last units of a product. Also reads what checkout needs alongside a hold: the
         per-student limits and the Venmo username saved by an earlier purchase.
Authentication/Authorization Requirements: N/A (called by the shop controller after its session checks)
Expected Request Information: req.models, the signed-in user's id, validated cart lines, and nowMs.
Expected Response Information: hold or purchase documents, or throws ShopHoldError with an HTTP status.

Requires a MongoDB replica set. Transactions are unavailable on a standalone server.
Expired holds are released in their own committed transaction before the error is thrown, because
throwing inside a transaction would roll the release back.
*/

import {
  DROP_UNIT_CAP,
  holdExpiresAtMs,
  holdTotalCents,
  isHoldDeadlinePassed,
  removeHoldLine,
} from "./shopHolds.js";
import { currentLimits, limitFor } from "./shopLimits.js";

const DUPLICATE_KEY_ERROR = 11000;
const SWEEP_BATCH_LIMIT = 100;

const VENMO_USERNAME_MISMATCH_MESSAGE =
  "This doesn't match the Venmo username on your account. Email iuga@uw.edu to change it.";

export class ShopHoldError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "ShopHoldError";
    this.status = status;
  }
}

export async function withTransaction(models, work) {
  const session = await models.ShopHolds.startSession();
  try {
    let outcome;
    await session.withTransaction(async () => {
      outcome = await work(session);
    });
    return outcome;
  } finally {
    await session.endSession();
  }
}

// Counter documents are created outside the transaction, so the conditional updates inside it only
// change documents that already exist. A duplicate-key error means another request created it first.
async function ensureCounter(Model, filter, defaults) {
  try {
    await Model.updateOne(filter, { $setOnInsert: defaults }, { upsert: true });
  } catch (error) {
    if (error?.code !== DUPLICATE_KEY_ERROR) {
      throw error;
    }
  }
}

async function reserveLine(models, session, { userId, catalogId, line }) {
  const { sku, quantity } = line;
  const stock = await models.ShopCapacity.updateOne(
    { catalogId, sku, reservedUnits: { $lte: DROP_UNIT_CAP - quantity } },
    { $inc: { reservedUnits: quantity } },
    { session },
  );
  if (stock.matchedCount !== 1) {
    throw new ShopHoldError(409, `Not enough ${line.name} left in this drop.`);
  }

  const limit = limitFor(await currentLimits(models), sku);
  const student = await models.ShopStudentUnits.updateOne(
    { userId, sku, units: { $lte: limit - quantity } },
    { $inc: { units: quantity } },
    { session },
  );
  if (student.matchedCount !== 1) {
    throw new ShopHoldError(409, `${line.name} is limited to ${limit} per student.`);
  }
}

async function releaseLines(models, session, { userId, catalogId, lines }) {
  for (const line of lines) {
    await models.ShopCapacity.updateOne(
      { catalogId, sku: line.sku },
      { $inc: { reservedUnits: -line.quantity } },
      { session },
    );
    await models.ShopStudentUnits.updateOne(
      { userId, sku: line.sku },
      { $inc: { units: -line.quantity } },
      { session },
    );
  }
}

// Move an active hold to a final status. Returns the hold as it was before the change, or null when it
// was no longer active. This conditional update decides between confirm, cancel, and expiry.
// `changes` are written in the same update as the status.
async function closeActiveHold(models, session, holdId, status, changes = {}) {
  return models.ShopHolds.findOneAndUpdate(
    { _id: holdId, status: "active" },
    { $set: { status, ...changes } },
    { session, returnDocument: "before" },
  ).lean();
}

async function loadOwnedHold(models, session, holdId, userId) {
  return models.ShopHolds.findOne({ _id: holdId, userId }, null, { session }).lean();
}

// Releases an active hold whose deadline has passed. Must be called inside a transaction that commits.
async function expireInTransaction(models, session, hold) {
  const closed = await closeActiveHold(models, session, hold._id, "expired");
  if (closed) {
    await releaseLines(models, session, closed);
  }
}

// Returns { hold } when the hold is active and in time. Otherwise returns { error } and commits any
// expiry it found, so the caller must commit before throwing the error.
async function activeHoldOrError(models, session, { holdId, userId, nowMs }) {
  const hold = await loadOwnedHold(models, session, holdId, userId);
  if (!hold) {
    return { error: new ShopHoldError(404, "Hold not found.") };
  }
  if (hold.status !== "active") {
    return { error: new ShopHoldError(409, `This hold is ${hold.status}.`) };
  }
  if (isHoldDeadlinePassed(new Date(hold.expiresAt).getTime(), nowMs)) {
    await expireInTransaction(models, session, hold);
    return { error: new ShopHoldError(409, "This hold has expired. Its items have been released.") };
  }
  return { hold };
}

/*
 * @behavior Release every active hold whose deadline has passed, in batches of at most 100.
 *           Each hold is released in its own committed transaction.
 * @returns number of holds found in this pass
 */
export async function sweepExpiredHolds(models, nowMs) {
  const due = await models.ShopHolds.find(
    { status: "active", expiresAt: { $lte: new Date(nowMs) } },
    { _id: 1 },
  ).limit(SWEEP_BATCH_LIMIT).lean();

  for (const { _id } of due) {
    await withTransaction(models, (session) => expireInTransaction(models, session, { _id }));
  }
  return due.length;
}

/*
 * @behavior Reserve every cart line or none. Sweeps expired holds first. A student has one active hold:
 *           a new hold cancels the student's earlier active hold in the same transaction, so a student
 *           who left the checkout page can check out again. A refused hold leaves the earlier one active.
 * @param userId — signed-in student's user id
 * @param catalogId — the drop; stock is counted per drop, so it carries over a catalog version change
 * @param catalogVersion — current catalog version, recorded on the hold
 * @param lines — validated lines: { sku, name, size, quantity, unitPriceCents }
 * @param nowMs — current timestamp in milliseconds
 * @param maintenanceAtMs — announced maintenance time, or null; the hold ends no later than it
 * @returns the created hold document
 * @throws ShopHoldError 409 when any line exceeds stock or the per-student limit
 */
export async function createHold(models, { userId, catalogId, catalogVersion, lines, nowMs, maintenanceAtMs = null }) {
  await sweepExpiredHolds(models, nowMs);
  await ensureCounter(models.ShopStudentCheckouts, { _id: userId }, { revision: 0 });

  for (const line of lines) {
    await ensureCounter(models.ShopCapacity, { catalogId, sku: line.sku }, { reservedUnits: 0 });
    await ensureCounter(models.ShopStudentUnits, { userId, sku: line.sku }, { units: 0 });
  }

  return withTransaction(models, async (session) => {
    // Write before reading active holds: disjoint carts must still conflict for the same student.
    await models.ShopStudentCheckouts.updateOne({ _id: userId }, { $inc: { revision: 1 } }, { session });
    const earlierHolds = await models.ShopHolds.find({ userId, status: "active" }, { _id: 1 }, { session }).lean();
    for (const { _id } of earlierHolds) {
      const closed = await closeActiveHold(models, session, _id, "cancelled");
      if (closed) {
        await releaseLines(models, session, closed);
      }
    }
    for (const line of lines) {
      await reserveLine(models, session, { userId, catalogId, line });
    }
    const [hold] = await models.ShopHolds.create(
      [{
        userId,
        catalogId,
        catalogVersion,
        lines,
        status: "active",
        expiresAt: new Date(holdExpiresAtMs(nowMs, maintenanceAtMs)),
      }],
      { session },
    );
    return hold.toObject();
  });
}

/*
 * @behavior Load one of the student's holds for the checkout page. Expires it first if its deadline has passed.
 * @returns the hold document, with status "expired" when the deadline has passed
 * @throws ShopHoldError 404 when the hold does not exist or belongs to another student
 */
export async function getHold(models, { holdId, userId, nowMs }) {
  return withTransaction(models, async (session) => {
    const hold = await loadOwnedHold(models, session, holdId, userId);
    if (!hold) {
      throw new ShopHoldError(404, "Hold not found.");
    }
    if (hold.status === "active" && isHoldDeadlinePassed(new Date(hold.expiresAt).getTime(), nowMs)) {
      await expireInTransaction(models, session, hold);
      return { ...hold, status: "expired" };
    }
    return hold;
  });
}

/*
 * @behavior Cancel an active hold and release its units.
 * @throws ShopHoldError 404 when the hold is not found, 409 when it is not active or has expired
 */
export async function cancelHold(models, { holdId, userId, nowMs }) {
  const outcome = await withTransaction(models, async (session) => {
    const checked = await activeHoldOrError(models, session, { holdId, userId, nowMs });
    if (checked.error) {
      return checked;
    }
    const closed = await closeActiveHold(models, session, holdId, "cancelled");
    if (!closed) {
      return { error: new ShopHoldError(409, "This hold is no longer active.") };
    }
    await releaseLines(models, session, closed);
    return { hold: { ...closed, status: "cancelled" } };
  });
  if (outcome.error) {
    throw outcome.error;
  }
  return outcome.hold;
}

/*
 * @behavior Remove one line from an active hold and release its units. The deadline does not change.
 *           Removing the last line cancels the hold.
 * @throws ShopHoldError 404 when the hold or line is not found, 409 when the hold is not active or has expired
 */
export async function removeLineFromHold(models, { holdId, userId, sku, size, nowMs }) {
  const outcome = await withTransaction(models, async (session) => {
    const checked = await activeHoldOrError(models, session, { holdId, userId, nowMs });
    if (checked.error) {
      return checked;
    }
    const { hold } = checked;
    const { lines, removed } = removeHoldLine(hold.lines, sku, size);
    if (!removed) {
      return { error: new ShopHoldError(404, "That line is not in this hold.") };
    }

    await releaseLines(models, session, {
      userId: hold.userId,
      catalogId: hold.catalogId,
      lines: [removed],
    });

    if (lines.length === 0) {
      await closeActiveHold(models, session, holdId, "cancelled", { lines: [] });
      return { hold: { ...hold, lines: [], status: "cancelled" } };
    }

    await models.ShopHolds.updateOne({ _id: holdId }, { $set: { lines } }, { session });
    return { hold: { ...hold, lines } };
  });
  if (outcome.error) {
    throw outcome.error;
  }
  return outcome.hold;
}

/*
 * @behavior Read the Venmo username saved to the student's profile by an earlier purchase, lowercased.
 * @param session — optional transaction session
 * @returns the saved username, or null when the student has none
 */
export async function findSavedVenmoUsername(models, userId, session = null) {
  const user = await models.Users.findById(userId).select("+uVenmoUsername").session(session).lean();
  return user?.uVenmoUsername ? user.uVenmoUsername.toLowerCase() : null;
}

/*
 * @behavior Confirm an active hold before its deadline. Creates a pending purchase with an immutable
 *           snapshot of the lines and prices, keeps the units consumed, and saves the Venmo username
 *           and phone number to the student's profile. A student who already has a saved Venmo
 *           username must confirm with the same one; the hold stays active when it differs.
 * @throws ShopHoldError 404 when the hold is not found, 409 when it is not active, has expired,
 *         or the Venmo username differs from the saved one
 */
export async function confirmHold(models, { holdId, userId, venmoUsername, phoneNumber, nowMs }) {
  const outcome = await withTransaction(models, async (session) => {
    const checked = await activeHoldOrError(models, session, { holdId, userId, nowMs });
    if (checked.error) {
      return checked;
    }
    const { hold } = checked;
    const savedUsername = await findSavedVenmoUsername(models, userId, session);
    if (savedUsername !== null && savedUsername !== venmoUsername) {
      return { error: new ShopHoldError(409, VENMO_USERNAME_MISMATCH_MESSAGE) };
    }
    const closed = await closeActiveHold(models, session, holdId, "confirmed");
    if (!closed) {
      return { error: new ShopHoldError(409, "This hold is no longer active.") };
    }

    const [purchase] = await models.ShopPurchases.create(
      [{
        holdId,
        userId,
        catalogId: hold.catalogId,
        catalogVersion: hold.catalogVersion,
        venmoUsername,
        lines: hold.lines,
        totalCents: holdTotalCents(hold.lines),
        status: "pending",
        confirmedAt: new Date(nowMs),
      }],
      { session },
    );
    await models.ShopHolds.updateOne({ _id: holdId }, { $set: { purchaseId: purchase._id } }, { session });
    await models.Users.updateOne(
      { _id: userId },
      { $set: { uVenmoUsername: venmoUsername, uPhoneNumber: phoneNumber } },
      { session },
    );
    return { purchase: purchase.toObject() };
  });
  if (outcome.error) {
    throw outcome.error;
  }
  return outcome.purchase;
}

/*
 * @behavior The per-student limits in effect now: the default and each product's own limit. Served from the
 *           limits cache, so the database is read at most once per cache window.
 * @returns {Promise<{ defaultLimit: number, perSku: Map<string, number> }>}
 */
export async function findLimits(models) {
  return currentLimits(models);
}

/*
 * @behavior The switches an officer can change in the database, for example before an update: whether new
 *           checkouts are paused, and an announced maintenance time. Read on every new hold, so a change
 *           takes effect at once and needs no deploy.
 * @returns {Promise<{ newCheckoutsPaused: boolean, maintenanceAtMs: number | null }>} not paused and no
 *          maintenance when the settings document is missing
 */
export async function findCheckoutSettings(models) {
  const settings = await models.ShopSettings
    .findOne({ key: "shop" }, { _id: 0, newCheckoutsPaused: 1, maintenanceAt: 1 })
    .lean();
  return {
    newCheckoutsPaused: settings?.newCheckoutsPaused === true,
    maintenanceAtMs: settings?.maintenanceAt ? new Date(settings.maintenanceAt).getTime() : null,
  };
}
