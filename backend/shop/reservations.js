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

/*
 * @behavior Take the ordered quantity off the shelf for each variant in a cart and write a
 *           time-limited reservation for it, so the order can be paid without overselling.
 * @param models — the database models, or fakes in tests
 * @param orderId — the order these holds belong to
 * @param items — the normalized cart: [{ skuKey, quantity }]
 * @param catalog — the price-list rows, which say which pile each variant comes from
 * @param now — when the holds start
 * @param ttlMs — how long a hold lasts before it is released
 * @param session — the database transaction the caller is already inside, if any
 * @returns the reservation records that were written
 * @exceptions throws InsufficientInventoryError when a variant does not have enough stock; any
 *             stock already taken in this attempt is put back first
 */
export async function holdInventory({
  models,
  orderId,
  items,
  catalog,
  now = new Date(),
  ttlMs = 15 * 60 * 1000,
  session = null,
}) {
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
      await models.InventoryReservation.create(reservationsToCreate, { session });
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
 * @param session — the database transaction the caller is already inside, if any
 * @param now — when the change happened
 * @returns how many reservations were marked consumed
 * @exceptions throws when a pile no longer holds what we reserved — two workers disagreed, so
 *             a human must look rather than us guessing
 */
export async function consumeInventory({
  models,
  orderId,
  session = null,
  now = new Date(),
}) {
  const reservations = await models.InventoryReservation.find(
    { orderId, state: "reserved" },
    null,
    { session },
  );

  const successfulConsumes = [];

  for (const res of reservations) {
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

    successfulConsumes.push(res);
  }

  for (const res of successfulConsumes) {
    await models.InventoryReservation.updateMany(
      { orderId, skuKey: res.skuKey, state: "reserved" },
      {
        $set: {
          state: "consumed",
          updatedAt: now,
        },
      },
      { session },
    );
  }

  return { consumedCount: successfulConsumes.length };
}

/*
 * @behavior Put held stock back on the shelf when — and only when — the payment link can no
 *           longer be paid: expired, cancelled, or otherwise dead.
 * @param models — the database models, or fakes in tests
 * @param orderId — the order giving its holds back
 * @param sessionCannotBePaidVerified — proof from Stripe, or from our own expiry, that this
 *        attempt can no longer be paid. Stock must not go back without it: a buyer who pays
 *        after we released their hold would be charged for a hoodie we already gave away.
 * @param session — the database transaction the caller is already inside, if any
 * @param now — when the release happened
 * @returns how many reservations were released
 * @exceptions throws when that proof is not explicitly true, or when a pile no longer holds
 *             what we reserved
 */
export async function releaseInventory({
  models,
  orderId,
  sessionCannotBePaidVerified,
  session = null,
  now = new Date(),
}) {
  if (sessionCannotBePaidVerified !== true) {
    throw new Error("Cannot release inventory until we can verify the payment link can no longer be paid");
  }

  const reservations = await models.InventoryReservation.find(
    { orderId, state: "reserved" },
    null,
    { session },
  );

  const successfulReleases = [];

  for (const res of reservations) {
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

    successfulReleases.push(res);
  }

  for (const res of successfulReleases) {
    await models.InventoryReservation.updateMany(
      { orderId, skuKey: res.skuKey, state: "reserved" },
      {
        $set: {
          state: "released",
          updatedAt: now,
        },
      },
      { session },
    );
  }

  return { releasedCount: successfulReleases.length };
}
