import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import {
  shopCapacitySchema,
  shopHoldsSchema,
  shopLimitDefaultSchema,
  shopProductLimitsSchema,
  shopPurchasesSchema,
  shopSettingsSchema,
  shopStudentUnitsSchema,
  shopStudentCheckoutsSchema,
  usersSchema,
} from "../schemas/schemas.js";
import {
  cancelHold,
  confirmHold,
  createHold,
  getHold,
  isNewCheckoutPaused,
  removeLineFromHold,
  ShopHoldError,
  sweepExpiredHolds,
} from "../routes/api/v1/utils/shopCheckoutStore.js";
import { invalidateLimits } from "../routes/api/v1/utils/shopLimits.js";

// Runs only against a real replica set. Start one with
// scripts/start-replica-set-mongodb.sh and pass SHOP_REPLSET_URI.
const uri = process.env.SHOP_REPLSET_URI;
const run = uri ? describe : describe.skip;

const HOUR_MS = 60 * 60 * 1000;
const FIFTEEN_MIN_MS = 15 * 60 * 1000;

run("shop checkout store on a replica set", () => {
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
      ShopStudentCheckouts: connection.model("ShopStudentCheckouts", shopStudentCheckoutsSchema),
      ShopProductLimits: connection.model("ShopProductLimits", shopProductLimitsSchema),
      ShopLimitDefault: connection.model("ShopLimitDefault", shopLimitDefaultSchema),
      ShopSettings: connection.model("ShopSettings", shopSettingsSchema),
      Users: connection.model("Users", usersSchema),
    };
  });

  after(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  // Each test gets its own drop, catalog version, and students, so tests cannot share counters.
  function testDrop() {
    return { catalogId: `test-${new mongoose.Types.ObjectId().toHexString()}`, catalogVersion: "test-v1" };
  }

  function line(sku, quantity = 1, size = "M", unitPriceCents = 3200) {
    return { sku, name: sku, size, quantity, unitPriceCents };
  }

  async function seedCapacity(catalogId, sku, reservedUnits) {
    await models.ShopCapacity.create({ catalogId, sku, reservedUnits });
  }

  async function counter(catalogId, sku) {
    const doc = await models.ShopCapacity.findOne({ catalogId, sku }).lean();
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
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();

    const hold = await createHold(models, {
      userId,
      catalogId,
      catalogVersion,
      lines: [line("info-hoodie", 1), line("info-tote-bag", 1, "One Size", 2000)],
      nowMs,
    });

    assert.equal(hold.status, "active");
    assert.equal(hold.expiresAt.getTime(), nowMs + FIFTEEN_MIN_MS);
    assert.equal(await counter(catalogId, "info-hoodie"), 1);
    assert.equal(await counter(catalogId, "info-tote-bag"), 1);
    assert.equal(await studentUnits(userId, "info-hoodie"), 1);
    assert.equal(await studentUnits(userId, "info-tote-bag"), 1);
  });

  it("holds nothing when any line exceeds stock (all-or-none)", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    await seedCapacity(catalogId, "info-tote-bag", 24);

    await assertRejected(
      createHold(models, {
        userId,
        catalogId,
        catalogVersion,
        lines: [line("info-hoodie", 1), line("info-tote-bag", 1, "One Size", 2000)],
        nowMs: Date.now(),
      }),
      409,
      /Not enough info-tote-bag/,
    );

    assert.equal(await counter(catalogId, "info-hoodie"), 0, "hoodie line must roll back");
    assert.equal(await studentUnits(userId, "info-hoodie"), 0, "student units must roll back");
    assert.equal(await models.ShopHolds.countDocuments({ userId }), 0);
  });

  it("lets concurrent holds take only the last unit once", async () => {
    const { catalogId, catalogVersion } = testDrop();
    await seedCapacity(catalogId, "info-hoodie", 23);
    const nowMs = Date.now();

    const results = await Promise.allSettled([
      createHold(models, { userId: new mongoose.Types.ObjectId(), catalogId, catalogVersion, lines: [line("info-hoodie")], nowMs }),
      createHold(models, { userId: new mongoose.Types.ObjectId(), catalogId, catalogVersion, lines: [line("info-hoodie")], nowMs }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof ShopHoldError);
    assert.equal(rejected[0].reason.status, 409);
    assert.equal(await counter(catalogId, "info-hoodie"), 24);
  });

  it("keeps the stock count when the catalog version changes during a drop", async () => {
    const { catalogId } = testDrop();
    await seedCapacity(catalogId, "info-hoodie", 23);
    const nowMs = Date.now();
    const firstBuyer = new mongoose.Types.ObjectId();

    const held = await createHold(models, {
      userId: firstBuyer, catalogId, catalogVersion: "test-v1", lines: [line("info-hoodie")], nowMs,
    });
    await assertRejected(
      createHold(models, {
        userId: new mongoose.Types.ObjectId(), catalogId, catalogVersion: "test-v2", lines: [line("info-hoodie")], nowMs,
      }),
      409,
      /Not enough info-hoodie/,
    );
    assert.equal(await counter(catalogId, "info-hoodie"), 24);

    // A hold made before the edit still returns its units to the same drop.
    await cancelHold(models, { holdId: held._id, userId: firstBuyer, nowMs });
    assert.equal(await counter(catalogId, "info-hoodie"), 23);
  });

  it("reports new checkouts as paused only while the setting is on", async () => {
    assert.equal(await isNewCheckoutPaused(models), false, "a missing settings document means not paused");

    await models.ShopSettings.updateOne({ key: "shop" }, { $set: { newCheckoutsPaused: true } }, { upsert: true });
    assert.equal(await isNewCheckoutPaused(models), true);

    await models.ShopSettings.updateOne({ key: "shop" }, { $set: { newCheckoutsPaused: false } });
    assert.equal(await isNewCheckoutPaused(models), false);
  });

  it("rejects a cart over the default limit of 5 per student", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();

    await assertRejected(
      createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-crewneck", 6)], nowMs: Date.now() }),
      409,
      /limited to 5 per student/,
    );

    assert.equal(await counter(catalogId, "info-crewneck"), 0, "rejected hold must not change stock");
    assert.equal(await studentUnits(userId, "info-crewneck"), 0);
  });

  it("counts a confirmed purchase toward the student's limit", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    await models.Users.create({ _id: userId, uNetId: `net-${userId.toHexString()}` });
    const nowMs = Date.now();

    const hold = await createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-crewneck", 5)], nowMs });
    await confirmHold(models, { holdId: hold._id, userId, venmoUsername: "jane.doe", phoneNumber: "2065550123", nowMs });
    await assertRejected(
      createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-crewneck", 1, "L")], nowMs }),
      409,
      /limited to 5 per student/,
    );

    assert.equal(await counter(catalogId, "info-crewneck"), 5, "rejected hold must not change stock");
    assert.equal(await studentUnits(userId, "info-crewneck"), 5);
  });

  it("reads the per-product limit from its document", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    await models.ShopProductLimits.create({ sku: "info-baseball-tee", perStudentLimit: 2 });
    invalidateLimits();

    await assertRejected(
      createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-baseball-tee", 3)], nowMs: Date.now() }),
      409,
      /limited to 2 per student/,
    );
    await createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-baseball-tee", 2)], nowMs: Date.now() });
    assert.equal(await studentUnits(userId, "info-baseball-tee"), 2);
  });

  it("replaces the student's active hold when they check out again", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();

    const first = await createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-hoodie", 5)], nowMs });
    const second = await createHold(models, {
      userId,
      catalogId,
      catalogVersion,
      lines: [line("info-hoodie", 5, "L"), line("info-tote-bag", 1, "One Size", 2000)],
      nowMs,
    });

    assert.equal((await models.ShopHolds.findById(first._id).lean()).status, "cancelled");
    assert.equal(second.status, "active");
    assert.equal(await models.ShopHolds.countDocuments({ userId, status: "active" }), 1);
    assert.equal(await counter(catalogId, "info-hoodie"), 5);
    assert.equal(await counter(catalogId, "info-tote-bag"), 1);
    assert.equal(await studentUnits(userId, "info-hoodie"), 5);
  });

  it("keeps the student's active hold when the new checkout is refused", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    await seedCapacity(catalogId, "info-tote-bag", 24);

    const first = await createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-hoodie")], nowMs });
    await assertRejected(
      createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-tote-bag", 1, "One Size", 2000)], nowMs }),
      409,
      /Not enough info-tote-bag/,
    );

    assert.equal((await models.ShopHolds.findById(first._id).lean()).status, "active");
    assert.equal(await counter(catalogId, "info-hoodie"), 1);
    assert.equal(await studentUnits(userId, "info-hoodie"), 1);
  });

  it("keeps one concurrent disjoint cart active and replaces it on the next checkout", async () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { catalogId, catalogVersion } = testDrop();
      const userId = new mongoose.Types.ObjectId();
      const nowMs = Date.now();
      const completed = await Promise.all(Array.from({ length: 4 }, (_, index) =>
        createHold(models, {
          userId, catalogId, catalogVersion, lines: [line(`disjoint-${attempt}-${index}`)], nowMs,
        }),
      ));
      const stored = await Promise.all(completed.map((hold) => getHold(models, {
        holdId: hold._id, userId, nowMs,
      })));
      const active = stored.filter((hold) => hold.status === "active");
      assert.equal(active.length, 1);
      assert.equal(stored.filter((hold) => hold.status === "cancelled").length, 3);
      for (const hold of stored) {
        assert.equal(await counter(catalogId, hold.lines[0].sku), hold.status === "active" ? 1 : 0);
        assert.equal(await studentUnits(userId, hold.lines[0].sku), hold.status === "active" ? 1 : 0);
      }
      const replacement = await createHold(models, {
        userId, catalogId, catalogVersion, lines: [line(`replacement-${attempt}`)], nowMs,
      });
      assert.equal((await getHold(models, { holdId: active[0]._id, userId, nowMs })).status, "cancelled");
      assert.equal((await getHold(models, { holdId: replacement._id, userId, nowMs })).status, "active");
      for (const hold of stored) {
        assert.equal(await counter(catalogId, hold.lines[0].sku), 0);
        assert.equal(await studentUnits(userId, hold.lines[0].sku), 0);
      }
      assert.equal(await counter(catalogId, replacement.lines[0].sku), 1);
      assert.equal(await studentUnits(userId, replacement.lines[0].sku), 1);
    }
  });

  it("releases stock and student units when a hold is cancelled", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const hold = await createHold(models, {
      userId,
      catalogId,
      catalogVersion,
      lines: [line("info-hoodie")],
      nowMs: Date.now(),
    });

    const cancelled = await cancelHold(models, { holdId: hold._id, userId, nowMs: Date.now() });
    assert.equal(cancelled.status, "cancelled");
    assert.equal(await counter(catalogId, "info-hoodie"), 0);
    assert.equal(await studentUnits(userId, "info-hoodie"), 0);
  });

  it("removing one line releases only that line and keeps the deadline", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, {
      userId,
      catalogId,
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
    assert.equal(await counter(catalogId, "info-hoodie"), 0);
    assert.equal(await counter(catalogId, "info-crewneck"), 1);
  });

  it("cancels the hold when its last line is removed", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-hoodie")], nowMs });

    const updated = await removeLineFromHold(models, {
      holdId: hold._id,
      userId,
      sku: "info-hoodie",
      size: "M",
      nowMs,
    });

    assert.equal(updated.status, "cancelled");
    assert.equal(await counter(catalogId, "info-hoodie"), 0);
    assert.equal(await studentUnits(userId, "info-hoodie"), 0);

    const stored = await getHold(models, { holdId: hold._id, userId, nowMs });
    assert.equal(stored.status, "cancelled");
    assert.deepEqual(stored.lines, []);
  });

  it("confirms before the deadline into a pending purchase with a snapshot and saves the username", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    await models.Users.create({ _id: userId, uNetId: `net-${userId.toHexString()}` });
    const nowMs = Date.now();
    const hold = await createHold(models, {
      userId,
      catalogId,
      catalogVersion,
      lines: [line("info-hoodie")],
      nowMs,
    });

    const purchase = await confirmHold(models, {
      holdId: hold._id,
      userId,
      venmoUsername: "jane.doe",
      phoneNumber: "2065550123",
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

    const user = await models.Users.findById(userId).select("+uVenmoUsername +uPhoneNumber").lean();
    assert.equal(user.uVenmoUsername, "jane.doe");
    assert.equal(user.uPhoneNumber, "2065550123");

    const ordinaryUser = await models.Users.findById(userId).lean();
    assert.ok(!Object.hasOwn(ordinaryUser, "uVenmoUsername"), "ordinary user queries must omit payment details");
    assert.ok(!Object.hasOwn(ordinaryUser, "uPhoneNumber"), "ordinary user queries must omit contact details");

    assert.equal(await counter(catalogId, "info-hoodie"), 1, "confirmed units stay consumed");
    assert.equal(await studentUnits(userId, "info-hoodie"), 1);
  });

  it("rejects a different Venmo username than the saved one and keeps the hold active", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    await models.Users.create({ _id: userId, uNetId: `net-${userId.toHexString()}`, uVenmoUsername: "Jane.Doe" });
    const nowMs = Date.now();
    const hold = await createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-hoodie")], nowMs });

    await assertRejected(
      confirmHold(models, {
        holdId: hold._id,
        userId,
        venmoUsername: "someone.else",
        phoneNumber: "2065550123",
        nowMs: nowMs + 60 * 1000,
      }),
      409,
      /doesn't match the Venmo username on your account/,
    );

    assert.equal((await models.ShopHolds.findById(hold._id).lean()).status, "active");
    assert.equal(await models.ShopPurchases.countDocuments({ userId }), 0);
    const user = await models.Users.findById(userId).select("+uVenmoUsername").lean();
    assert.equal(user.uVenmoUsername, "Jane.Doe");

    // The saved username matches regardless of letter case.
    const purchase = await confirmHold(models, {
      holdId: hold._id,
      userId,
      venmoUsername: "jane.doe",
      phoneNumber: "2065550123",
      nowMs: nowMs + 2 * 60 * 1000,
    });
    assert.equal(purchase.status, "pending");
  });

  it("rejects a confirmation at the deadline and releases the units", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-hoodie")], nowMs });

    await assertRejected(
      confirmHold(models, {
        holdId: hold._id,
        userId,
        venmoUsername: "jane.doe",
        phoneNumber: "2065550123",
        nowMs: nowMs + FIFTEEN_MIN_MS,
      }),
      409,
      /expired/,
    );

    const saved = await models.ShopHolds.findById(hold._id).lean();
    assert.equal(saved.status, "expired");
    assert.equal(await counter(catalogId, "info-hoodie"), 0, "late confirm must release stock");
    assert.equal(await studentUnits(userId, "info-hoodie"), 0);
    assert.equal(await models.ShopPurchases.countDocuments({ userId }), 0);
  });

  it("sweeps expired holds without a background job, and is idempotent", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const userId = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, { userId, catalogId, catalogVersion, lines: [line("info-hoodie")], nowMs });

    // The sweep is database-wide, so holds from other tests may also be due. Check this test's hold only.
    const swept = await sweepExpiredHolds(models, nowMs + HOUR_MS);
    assert.ok(swept >= 1);
    assert.equal((await models.ShopHolds.findById(hold._id).lean()).status, "expired");
    assert.equal(await counter(catalogId, "info-hoodie"), 0);
    assert.equal(await studentUnits(userId, "info-hoodie"), 0);

    assert.equal(await sweepExpiredHolds(models, nowMs + HOUR_MS), 0, "a second sweep finds nothing new");
  });

  it("does not let a student read or change another student's hold", async () => {
    const { catalogId, catalogVersion } = testDrop();
    const owner = new mongoose.Types.ObjectId();
    const other = new mongoose.Types.ObjectId();
    const nowMs = Date.now();
    const hold = await createHold(models, { userId: owner, catalogId, catalogVersion, lines: [line("info-hoodie")], nowMs });

    await assertRejected(getHold(models, { holdId: hold._id, userId: other, nowMs }), 404, /not found/);
    await assertRejected(cancelHold(models, { holdId: hold._id, userId: other, nowMs }), 404, /not found/);

    assert.equal(await counter(catalogId, "info-hoodie"), 1, "other student's cancel must not release");
  });
});
