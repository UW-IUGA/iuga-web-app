import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import {
  shopCapacitySchema,
  shopHoldsSchema,
  shopProductLimitsSchema,
  shopPurchasesSchema,
  shopStudentUnitsSchema,
  usersSchema,
} from "../schemas/schemas.js";
import {
  cancelHold,
  confirmHold,
  createHold,
  getHold,
  removeLineFromHold,
  ShopHoldError,
  sweepExpiredHolds,
} from "../routes/api/v1/utils/shopHoldStore.js";

// Runs only against a real replica set (ADR-0006 Gate B). Start one with
// scripts/start-replica-set-mongodb.sh and pass SHOP_REPLSET_URI.
const uri = process.env.SHOP_REPLSET_URI;
const run = uri ? describe : describe.skip;

const HOUR_MS = 60 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

run("shop hold store on a replica set", () => {
  let connection;
  let models;

  before(async () => {
    connection = await mongoose.createConnection(uri, {
      dbName: `shop_replset_${Date.now()}`,
    }).asPromise();
    models = {
      ShopHolds: connection.model("ShopHolds", shopHoldsSchema),
      ShopPurchases: connection.model("ShopPurchases", shopPurchasesSchema),
      ShopCapacity: connection.model("ShopCapacity", shopCapacitySchema),
      ShopStudentUnits: connection.model("ShopStudentUnits", shopStudentUnitsSchema),
      ShopProductLimits: connection.model("ShopProductLimits", shopProductLimitsSchema),
      Users: connection.model("Users", usersSchema),
    };
  });

  after(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  // Each test gets its own drop, catalog version, and students, so tests cannot share counters.
  function testDrop() {
    return { catalogVersion: `test-${new mongoose.Types.ObjectId().toHexString()}` };
  }

  function line(sku, quantity = 1, size = "M", unitPriceCents = 3200) {
    return { sku, name: sku, size, quantity, unitPriceCents };
  }

  async function seedCapacity(catalogVersion, sku, reservedUnits) {
    await models.ShopCapacity.create({ catalogVersion, sku, reservedUnits });
  }

  async function counter(catalogVersion, sku) {
    const doc = await models.ShopCapacity.findOne({ catalogVersion, sku }).lean();
    return doc ? doc.reservedUnits : 0;
  }

  async function studentUnits(userId, sku) {
    const doc = await models.ShopStudentUnits.findOne({ userId, sku }).lean();
    return doc ? doc.units : 0;
  }

  async function assertRejected(promise, status, messagePattern) {
    await assert.rejects(promise, (error) => {
      assert.ok(error instanceof ShopHoldError, `expected ShopHoldError, got ${error?.name}`);
      assert.equal(error.status, status);
      assert.match(error.message, messagePattern);
      return true;
    });
  }

  it("holds every line and records stock and student units", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();

    const hold = await createHold(models, {
      userId,
      catalogVersion,
      lines: [line("info-hoodie", 1), line("info-tote-bag", 1, "One Size", 2000)],
      nowMs,
    });

    assert.equal(hold.status, "active");
    assert.equal(hold.expiresAt.getTime(), nowMs + FIFTEEN_MIN_MS);
    assert.equal(await counter(catalogVersion, "info-hoodie"), 1);
    assert.equal(await counter(catalogVersion, "info-tote-bag"), 1);
    assert.equal(await studentUnits(userId, "info-hoodie"), 1);
    assert.equal(await studentUnits(userId, "info-tote-bag"), 1);
  });

  it("holds nothing when any line exceeds stock (all-or-none)", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    await seedCapacity(catalogVersion, "info-tote-bag", 24);

    await assertRejected(
      createHold(models, {
        userId,
        catalogVersion,
        lines: [line("info-hoodie", 1), line("info-tote-bag", 1, "One Size", 2000)],
        nowMs: Date.now(),
      }),
      409,
      /Not enough info-tote-bag/,
    );

    assert.equal(await counter(catalogVersion, "info-hoodie"), 0, "hoodie line must roll back");
    assert.equal(await studentUnits(userId, "info-hoodie"), 0, "student units must roll back");
    assert.equal(await models.ShopHolds.countDocuments({ userId }), 0);
  });

  it("lets concurrent holds take only the last unit once", async () => {
    const { catalogVersion } = testDrop();
    await seedCapacity(catalogVersion, "info-hoodie", 23);
    const nowMs = Date.now();

    const results = await Promise.allSettled([
      createHold(models, { userId: new mongoose.Types.ObjectId(), catalogVersion, lines: [line("info-hoodie")], nowMs }),
      createHold(models, { userId: new mongoose.Types.ObjectId(), catalogVersion, lines: [line("info-hoodie")], nowMs }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof ShopHoldError);
    assert.equal(rejected[0].reason.status, 409);
    assert.equal(await counter(catalogVersion, "info-hoodie"), 24);
  });

  it("rejects a second hold of a product that would exceed the student's limit", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();

    await createHold(models, { userId, catalogVersion, lines: [line("info-crewneck")], nowMs });
    await assertRejected(
      createHold(models, { userId, catalogVersion, lines: [line("info-crewneck", 1, "L")], nowMs }),
      409,
      /limited to 1 per student/,
    );

    assert.equal(await counter(catalogVersion, "info-crewneck"), 1, "rejected hold must not change stock");
    assert.equal(await studentUnits(userId, "info-crewneck"), 1);
  });

  it("reads the per-product limit, so a raised limit allows more units", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    await models.ShopProductLimits.create({ sku: "info-baseball-tee", perStudentLimit: 2 });

    await createHold(models, { userId, catalogVersion, lines: [line("info-baseball-tee", 2)], nowMs: Date.now() });
    assert.equal(await studentUnits(userId, "info-baseball-tee"), 2);
  });

  it("releases stock and student units when a hold is cancelled", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const hold = await createHold(models, {
      userId,
      catalogVersion,
      lines: [line("info-hoodie")],
      nowMs: Date.now(),
    });

    const cancelled = await cancelHold(models, { holdId: hold._id, userId, nowMs: Date.now() });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(await counter(catalogVersion, "info-hoodie"), 0);
    assert.equal(await studentUnits(userId, "info-hoodie"), 0);
  });

  it("removing one line releases only that line and keeps the deadline", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, {
      userId,
      catalogVersion,
      lines: [line("info-hoodie", 1), line("info-crewneck", 1, "L", 3000)],
      nowMs,
    });

    const updated = await removeLineFromHold(models, {
      holdId: hold._id,
      userId,
      sku: "info-hoodie",
      size: "M",
      nowMs: nowMs + 60 * 1000,
    });

    assert.equal(updated.status, "active");
    assert.equal(updated.lines.length, 1);
    assert.equal(updated.lines[0].sku, "info-crewneck");
    assert.equal(updated.expiresAt.getTime(), nowMs + FIFTEEN_MIN_MS, "deadline must not reset");
    assert.equal(await counter(catalogVersion, "info-hoodie"), 0);
    assert.equal(await counter(catalogVersion, "info-crewneck"), 1);
  });

  it("cancels the hold when its last line is removed", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, { userId, catalogVersion, lines: [line("info-hoodie")], nowMs });

    const updated = await removeLineFromHold(models, {
      holdId: hold._id,
      userId,
      sku: "info-hoodie",
      size: "M",
      nowMs,
    });

    assert.equal(updated.status, "cancelled");
    assert.equal(await counter(catalogVersion, "info-hoodie"), 0);
    assert.equal(await studentUnits(userId, "info-hoodie"), 0);

    const stored = await getHold(models, { holdId: hold._id, userId, nowMs });
    assert.equal(stored.status, "cancelled");
    assert.deepEqual(stored.lines, []);
  });

  it("confirms before the deadline into a pending purchase with a snapshot and saves the username", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    await models.Users.create({ _id: userId, uNetId: `net-${userId.toHexString()}` });
    const nowMs = Date.now();
    const hold = await createHold(models, {
      userId,
      catalogVersion,
      lines: [line("info-hoodie")],
      nowMs,
    });

    const purchase = await confirmHold(models, {
      holdId: hold._id,
      userId,
      venmoUsername: "jane.doe",
      nowMs: nowMs + 5 * 60 * 1000,
    });

    assert.equal(purchase.status, "pending");
    assert.equal(purchase.totalCents, 3200);
    assert.equal(purchase.venmoUsername, "jane.doe");
    assert.equal(purchase.lines[0].sku, "info-hoodie");
    assert.equal(purchase.lines[0].unitPriceCents, 3200);

    const saved = await models.ShopHolds.findById(hold._id).lean();
    assert.equal(saved.status, "confirmed");
    assert.equal(String(saved.purchaseId), String(purchase._id));

    const user = await models.Users.findById(userId).lean();
    assert.equal(user.uVenmoUsername, "jane.doe");

    assert.equal(await counter(catalogVersion, "info-hoodie"), 1, "confirmed units stay consumed");
    assert.equal(await studentUnits(userId, "info-hoodie"), 1);
  });

  it("rejects a confirmation at the deadline and releases the units", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, { userId, catalogVersion, lines: [line("info-hoodie")], nowMs });

    await assertRejected(
      confirmHold(models, {
        holdId: hold._id,
        userId,
        venmoUsername: "jane.doe",
        nowMs: nowMs + FIFTEEN_MIN_MS,
      }),
      409,
      /expired/,
    );

    const saved = await models.ShopHolds.findById(hold._id).lean();
    assert.equal(saved.status, "expired");
    assert.equal(await counter(catalogVersion, "info-hoodie"), 0, "late confirm must release stock");
    assert.equal(await studentUnits(userId, "info-hoodie"), 0);
    assert.equal(await models.ShopPurchases.countDocuments({ userId }), 0);
  });

  it("sweeps expired holds without a background job, and is idempotent", async () => {
    const { catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, { userId, catalogVersion, lines: [line("info-hoodie")], nowMs });

    // The sweep is database-wide, so holds from other tests may also be due. Check this test's hold only.
    const swept = await sweepExpiredHolds(models, nowMs + HOUR_MS);
    assert.ok(swept >= 1);
    assert.equal((await models.ShopHolds.findById(hold._id).lean()).status, "expired");
    assert.equal(await counter(catalogVersion, "info-hoodie"), 0);
    assert.equal(await studentUnits(userId, "info-hoodie"), 0);

    assert.equal(await sweepExpiredHolds(models, nowMs + HOUR_MS), 0, "a second sweep finds nothing new");
  });

  it("does not let a student read or change another student's hold", async () => {
    const { catalogVersion } = testDrop();
    const owner = new mongoose.Types.ObjectId();
    const other = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, { userId: owner, catalogVersion, lines: [line("info-hoodie")], nowMs });

    await assertRejected(getHold(models, { holdId: hold._id, userId: other, nowMs }), 404, /not found/);
    await assertRejected(cancelHold(models, { holdId: hold._id, userId: other, nowMs }), 404, /not found/);

    assert.equal(await counter(catalogVersion, "info-hoodie"), 1, "other student's cancel must not release");
  });
});
