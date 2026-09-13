/**
 * Inventory reservation and fencing repository for the IUGA Stripe merchandise store.
 * Manages atomic holds, consumptions, and verified non-payable releases against InventoryCounter.
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

/*
 * @behavior  Holds inventory for finite catalog items in a cart, rolling back on failure.
 * @param     models — Mongoose model registry or injected mock models
 * @param     orderId — internal order identifier
 * @param     items — normalized cart items [{ skuKey, quantity }]
 * @param     catalog — list of catalog entries
 * @param     now — current timestamp for reservation
 * @param     ttlMs — reservation lifetime in milliseconds
 * @param     session — optional Mongoose client session for multi-document transaction
 * @returns   array of created InventoryReservation records
 * @exceptions throws InsufficientInventoryError if any item lacks available stock
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
  const successfulHolds = [];
  const reservationsToCreate = [];

  const expiresAt = new Date(now.getTime() + ttlMs);

  for (const item of items) {
    const entry = catalogMap.get(item.skuKey);
    if (!entry) {
      throw new Error(`Catalog entry not found for SKU ${item.skuKey}`);
    }

    // Preorder items do not reserve finite inventory
    if (entry.inventoryPolicy === "preorder") {
      continue;
    }

    const fulfillmentSku = entry.fulfillmentSku || item.skuKey;
    const quantity = item.quantity;

    // Atomically decrement available stock and increment reserved stock
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
      // Roll back previously successful holds in this batch
      for (const hold of successfulHolds) {
        await models.InventoryCounter.findOneAndUpdate(
          { fulfillmentSku: hold.fulfillmentSku },
          {
            $inc: {
              available: hold.quantity,
              reserved: -hold.quantity,
              version: 1,
            },
          },
          { session },
        );
      }

      throw new InsufficientInventoryError({
        skuKey: item.skuKey,
        fulfillmentSku,
        requestedQuantity: quantity,
        availableQuantity: 0,
      });
    }

    successfulHolds.push({ fulfillmentSku, quantity });
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
      // Compensate all previously held counters if reservation document persistence fails
      for (const hold of successfulHolds) {
        await models.InventoryCounter.findOneAndUpdate(
          { fulfillmentSku: hold.fulfillmentSku },
          {
            $inc: {
              available: hold.quantity,
              reserved: -hold.quantity,
              version: 1,
            },
          },
          { session },
        );
      }
      throw err;
    }
  }

  return reservationsToCreate;
}

/*
 * @behavior  Consumes reserved inventory upon verified payment confirmation.
 * @param     models — Mongoose model registry or injected mock models
 * @param     orderId — internal order identifier
 * @param     session — optional Mongoose client session
 * @param     now — current timestamp
 * @returns   object with consumedCount
 * @exceptions throws on database error or if counter fence is lost
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
 * @behavior  Releases reserved inventory back to available stock only when proof of non-payable session is verified.
 * @param     models — Mongoose model registry or injected mock models
 * @param     orderId — internal order identifier
 * @param     proofOfNonPayable — boolean indicating verified non-payable status (expired/canceled)
 * @param     reason — reason for releasing hold
 * @param     session — optional Mongoose client session
 * @param     now — current timestamp
 * @returns   object with releasedCount
 * @exceptions throws if proofOfNonPayable is not explicitly true or if counter fence is lost
 */
export async function releaseInventory({
  models,
  orderId,
  proofOfNonPayable,
  reason = "unspecified",
  session = null,
  now = new Date(),
}) {
  if (proofOfNonPayable !== true) {
    throw new Error("Cannot release inventory without verified proof of non-payable session");
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
