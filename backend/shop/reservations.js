/*
 * @behavior Track how much stock is held, sold, and put back for each pile we count, so two
 *           students cannot buy the last hoodie in the same moment and both be charged. Counters
 *           never move without a matching reservation record, and never go negative.
 */

export class InsufficientInventoryError extends Error {
  constructor({ skuKey, fulfillmentSku, requestedQuantity, availableQuantity }) {
    super(`Insufficient inventory for SKU ${skuKey} (${fulfillmentSku}): requested ${requestedQuantity}, available ${availableQuantity ?? 0}`);
    this.name = "InsufficientInventoryError";
    this.skuKey = skuKey;
    this.fulfillmentSku = fulfillmentSku;
    this.requestedQuantity = requestedQuantity;
    this.availableQuantity = availableQuantity ?? 0;
  }
}

// Put stock back after an attempt fails halfway through a multi-item order. Without this, every
// pile already taken from stays taken and the shop quietly sells less than it owns.
async function restoreStockCounters({ models, takenCounters, session }) {
  for (const taken of takenCounters) {
    await models.InventoryCounter.findOneAndUpdate(
      { fulfillmentSku: taken.fulfillmentSku },
      {
        $inc: {
          available: taken.quantity,
          reserved: -taken.quantity,
          version: 1,
        },
      },
      { session },
    );
  }
}

// The stock counter and its reservation record must move together, so every inventory change runs
// inside a transaction the caller opened. A call without one is a bug in that caller, not something
// to guess about.
function requireTransaction(session) {
  if (!session) {
    throw new Error("Inventory changes must run inside a database transaction");
  }
}

/*
 * @behavior Take the ordered quantity off the shelf for each variant in a cart and write a
 *           time-limited reservation for it, so the order can be paid without overselling.
 * @param models — the database models, or fakes in tests
 * @param orderId — the order these holds belong to
 * @param items — the normalized cart: [{ skuKey, quantity }]
 * @param catalog — the price-list rows, which say which pile each variant comes from
 * @param now — when the holds start
 * @param ttlMs — how long a hold lasts before it is released
 * @param session — the database transaction this runs inside; required
 * @returns the reservation records that were written
 * @exceptions throws when called outside a transaction, or InsufficientInventoryError when a
 *             variant does not have enough stock; any stock already taken in this attempt is put
 *             back first
 */
export async function holdInventory({
  models,
  orderId,
  items,
  catalog,
  now = new Date(),
  ttlMs = 15 * 60 * 1000,
  session,
}) {
  requireTransaction(session);
  if (!orderId || typeof orderId !== "string") {
    throw new Error("orderId must be a non-empty string");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("items must be a non-empty array");
  }

  const catalogMap = new Map((catalog || []).map((entry) => [entry.skuKey, entry]));
  const countersAlreadyDecremented = [];
  const reservationsToCreate = [];

  const expiresAt = new Date(now.getTime() + ttlMs);

  for (const item of items) {
    const entry = catalogMap.get(item.skuKey);
    if (!entry) {
      throw new Error(`Catalog entry not found for SKU ${item.skuKey}`);
    }

    // A preorder is sold before we own it, so there is no pile to take stock from.
    if (entry.inventoryPolicy === "preorder") {
      continue;
    }

    const fulfillmentSku = entry.fulfillmentSku || item.skuKey;
    const quantity = item.quantity;

    // The fence: only take stock while the pile still holds this much, so two buyers can never
    // take the same last hoodie, and the counter can never go negative.
    const updatedCounter = await models.InventoryCounter.findOneAndUpdate(
      {
        fulfillmentSku,
        available: { $gte: quantity },
      },
      {
        $inc: {
          available: -quantity,
          reserved: quantity,
          version: 1,
        },
      },
      { session, new: true },
    );

    if (!updatedCounter) {
      // This order failed halfway, so every pile already taken from is given back.
      await restoreStockCounters({ models, takenCounters: countersAlreadyDecremented, session });

      throw new InsufficientInventoryError({
        skuKey: item.skuKey,
        fulfillmentSku,
        requestedQuantity: quantity,
        availableQuantity: 0,
      });
    }

    countersAlreadyDecremented.push({ fulfillmentSku, quantity });
    reservationsToCreate.push({
      orderId,
      skuKey: item.skuKey,
      fulfillmentSku,
      quantity,
      state: "reserved",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (reservationsToCreate.length > 0) {
    try {
      // Mongoose refuses a session with several documents unless they are written in series.
      await models.InventoryReservation.create(reservationsToCreate, { session, ordered: true });
    } catch (err) {
      // The holds succeeded but the records did not, so the piles go back to how they were.
      await restoreStockCounters({ models, takenCounters: countersAlreadyDecremented, session });
      throw err;
    }
  }

  return reservationsToCreate;
}

/*
 * @behavior Make a paid order's holds permanent: the stock it reserved is now sold rather than
 *           held. Runs only after payment is confirmed.
 * @param models — the database models, or fakes in tests
 * @param orderId — the order whose holds become sales
 * @param session — the database transaction this runs inside; required
 * @param now — when the change happened
 * @returns how many reservations were marked consumed
 * @exceptions throws when called outside a transaction, or when a pile no longer holds what the
 *             reservation says it holds — something else already moved that stock, so an admin must
 *             look rather than us guessing
 */
export async function consumeInventory({
  models,
  orderId,
  session,
  now = new Date(),
}) {
  requireTransaction(session);

  const reservations = await models.InventoryReservation.find(
    { orderId, state: "reserved" },
    null,
    { session },
  );

  let consumedCount = 0;

  for (const res of reservations) {
    // Claim the reservation before its counter moves. The claim is what proves this call owns the
    // hold: a duplicate consume or release of the same order finds it already claimed and moves no
    // stock, so one hold can never be counted twice.
    const claimed = await models.InventoryReservation.findOneAndUpdate(
      { orderId, skuKey: res.skuKey, state: "reserved" },
      { $set: { state: "consumed", updatedAt: now } },
      { session, new: true },
    );
    if (!claimed) continue;

    const updatedCounter = await models.InventoryCounter.findOneAndUpdate(
      {
        fulfillmentSku: res.fulfillmentSku,
        reserved: { $gte: res.quantity },
      },
      {
        $inc: {
          reserved: -res.quantity,
          consumed: res.quantity,
          version: 1,
        },
      },
      { session, new: true },
    );

    if (!updatedCounter) {
      throw new Error(`Failed to consume inventory: counter fence lost for ${res.fulfillmentSku}`);
    }

    consumedCount += 1;
  }

  return { consumedCount };
}

/*
 * @behavior Put held stock back on the shelf when — and only when — the payment link can no
 *           longer be paid: expired, cancelled, or otherwise dead.
 * @param models — the database models, or fakes in tests
 * @param orderId — the order giving its holds back
 * @param sessionCannotBePaidVerified — proof from Stripe, or from our own expiry, that this
 *        attempt can no longer be paid. Stock must not go back without it: a buyer who pays
 *        after we released their hold would be charged for a hoodie we already gave away.
 * @param session — the database transaction this runs inside; required
 * @param now — when the release happened
 * @returns how many reservations were released
 * @exceptions throws when called outside a transaction, when that proof is not explicitly true,
 *             or when a pile no longer holds what we reserved
 */
export async function releaseInventory({
  models,
  orderId,
  sessionCannotBePaidVerified,
  session,
  now = new Date(),
}) {
  requireTransaction(session);
  if (sessionCannotBePaidVerified !== true) {
    throw new Error("Cannot release inventory until we can verify the payment link can no longer be paid");
  }

  const reservations = await models.InventoryReservation.find(
    { orderId, state: "reserved" },
    null,
    { session },
  );

  let releasedCount = 0;

  for (const res of reservations) {
    // Claim first, exactly as consumption does: the reservation itself decides who owns the hold,
    // so a duplicated release finds nothing to claim and puts one unit back, not two.
    const claimed = await models.InventoryReservation.findOneAndUpdate(
      { orderId, skuKey: res.skuKey, state: "reserved" },
      { $set: { state: "released", updatedAt: now } },
      { session, new: true },
    );
    if (!claimed) continue;

    const updatedCounter = await models.InventoryCounter.findOneAndUpdate(
      {
        fulfillmentSku: res.fulfillmentSku,
        reserved: { $gte: res.quantity },
      },
      {
        $inc: {
          available: res.quantity,
          reserved: -res.quantity,
          version: 1,
        },
      },
      { session, new: true },
    );

    if (!updatedCounter) {
      throw new Error(`Failed to release inventory: counter fence lost for ${res.fulfillmentSku}`);
    }

    releasedCount += 1;
  }

  return { releasedCount };
}
