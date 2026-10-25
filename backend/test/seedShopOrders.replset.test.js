import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import {
  shopCapacitySchema,
  shopHoldsSchema,
  shopLimitDefaultSchema,
  shopProductLimitsSchema,
  shopPurchasesSchema,
  shopStudentCheckoutsSchema,
  shopStudentUnitsSchema,
  usersSchema,
} from "../schemas/schemas.js";
import { setPaymentStatus } from "../routes/api/v1/utils/shopPurchaseReview.js";

// Runs only against a real replica set. Start one with
// scripts/start-replica-set-mongodb.sh and pass SHOP_REPLSET_URI.
const replsetUri = process.env.SHOP_REPLSET_URI;
const run = replsetUri ? describe : describe.skip;

const seedScript = fileURLToPath(new URL("../scripts/seed-shop-orders.mjs", import.meta.url));
const dbName = `seed_test_${process.pid}_${Date.now()}`;
const scratchUri = replsetUri?.replace("/?", `/${dbName}?`);

function runSeed(args) {
  return spawnSync(process.execPath, [seedScript, ...args], {
    encoding: "utf8",
    env: { PATH: process.env.PATH, DB_URI: scratchUri },
  });
}

function runSeedAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [seedScript, ...args], {
      env: { PATH: process.env.PATH, DB_URI: scratchUri },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

run("seed-shop-orders against a replica set", () => {
  let connection;
  let models;
  before(async () => {
    connection = await mongoose.createConnection(scratchUri).asPromise();
    models = {
      ShopHolds: connection.model("ShopHolds", shopHoldsSchema),
      ShopPurchases: connection.model("ShopPurchases", shopPurchasesSchema),
      ShopCapacity: connection.model("ShopCapacity", shopCapacitySchema),
      ShopStudentUnits: connection.model("ShopStudentUnits", shopStudentUnitsSchema),
      ShopStudentCheckouts: connection.model("ShopStudentCheckouts", shopStudentCheckoutsSchema),
      ShopProductLimits: connection.model("ShopProductLimits", shopProductLimitsSchema),
      ShopLimitDefault: connection.model("ShopLimitDefault", shopLimitDefaultSchema),
      Users: connection.model("Users", usersSchema),
    };
  });
  after(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  const purchases = () => connection.collection("shoppurchases");
  const users = () => connection.collection("users");
  const shopCapacities = () => connection.collection("shopcapacities");
  const studentUnits = () => connection.collection("shopstudentunits");
  const count = (filter) => purchases().countDocuments({ catalogVersion: "seed", ...filter });

  // The seed's own stock drop. Real checkout counters use "fall-2026" and must never be read or written here.
  const SEED_DROP = "seed-fall-2026";
  const REAL_DROP = "fall-2026";
  const SKUS = ["info-hoodie", "info-crewneck", "info-baseball-tee", "info-tote-bag"];
  const HOLDING = ["pending", "paid"];
  const DROP_UNIT_CAP = 24;
  const PER_STUDENT_LIMIT = 5;
  const officerId = new mongoose.Types.ObjectId();

  const holdingOrder = (filter) => purchases().findOne({ catalogVersion: "seed", status: { $in: HOLDING }, ...filter });
  const revisionOf = async (purchaseId) => (await purchases().findOne({ _id: purchaseId })).reviewRevision ?? 0;
  async function setStatus(purchaseId, status) {
    return setPaymentStatus(models, {
      purchaseId,
      status,
      expectedRevision: await revisionOf(purchaseId),
      actorId: officerId,
      nowMs: Date.now(),
    });
  }

  // Recomputes the expected counters from the seeded orders alone, then checks every stored counter against them.
  async function assertCountersMatchHoldingOrders() {
    const orders = await purchases().find({ catalogVersion: "seed" }).toArray();
    const skuTotals = new Map(SKUS.map((sku) => [sku, 0]));
    const buyerTotals = new Map();
    for (const order of orders.filter((o) => HOLDING.includes(o.status))) {
      for (const line of order.lines) {
        skuTotals.set(line.sku, (skuTotals.get(line.sku) ?? 0) + line.quantity);
        const key = `${order.userId}/${line.sku}`;
        buyerTotals.set(key, (buyerTotals.get(key) ?? 0) + line.quantity);
      }
    }

    assert.equal(await shopCapacities().countDocuments({ catalogId: SEED_DROP }), SKUS.length, "one seed counter per product");
    for (const sku of SKUS) {
      const row = await shopCapacities().findOne({ catalogId: SEED_DROP, sku });
      assert.ok(row, `seed counter exists for ${sku}`);
      assert.equal(row.reservedUnits, skuTotals.get(sku), `seed counter for ${sku}`);
    }

    const buyers = new Map();
    for (const order of orders) buyers.set(String(order.userId), order.userId);
    for (const user of await users().find({ uNetId: /^seed-/ }).toArray()) buyers.set(String(user._id), user._id);
    for (const [buyerKey, userId] of buyers) {
      for (const sku of SKUS) {
        const row = await studentUnits().findOne({ userId, sku });
        assert.ok(row, `seed student counter exists for ${buyerKey} ${sku}`);
        assert.equal(row.units, buyerTotals.get(`${buyerKey}/${sku}`) ?? 0, `seed student counter for ${buyerKey} ${sku}`);
      }
    }
  }

  it("--if-empty seeds an empty database", async () => {
    const result = runSeed(["--if-empty"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await count({}), 11);
  });

  it("--if-empty keeps a changed seeded order instead of resetting it", async () => {
    await purchases().updateOne({ catalogVersion: "seed", status: "refunded" }, { $set: { status: "paid" } });

    const result = runSeed(["--if-empty"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /skipping/);
    assert.equal(await count({ status: "paid" }), 2, "the changed order and the original paid order both remain");
    assert.equal(await count({ status: "refunded" }), 0);
  });

  it("a plain run resets the seeded orders, restoring the original statuses", async () => {
    const result = runSeed([]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await count({}), 11);
    assert.equal(await count({ status: "refunded" }), 1);
  });

  it("gives the officer contact details and a short payment to follow up on", async () => {
    const result = runSeed([]);
    assert.equal(result.status, 0, result.stderr);
    const students = await connection.collection("users").find({ uNetId: /^seed-/ }).toArray();
    assert.ok(students.every((student) => /^206555\d{4}$/.test(student.uPhoneNumber)), "fictional 555 numbers");
    const short = await purchases().find({ catalogVersion: "seed", status: "pending", amountReceivedCents: { $gt: 0 } }).toArray();
    assert.equal(short.length, 1);
    assert.ok(short[0].amountReceivedCents < short[0].totalCents);
  });

  it("resumes an interrupted seed without duplicating fixtures or overwriting completed orders", async () => {
    const users = connection.collection("users");
    const holds = connection.collection("shopholds");
    const nonseedUser = await users.insertOne({ uNetId: "qa-user" });
    const nonseedPurchase = await purchases().insertOne({ catalogVersion: "qa", status: "paid" });

    await connection.db.command({
      collMod: "shoppurchases",
      validator: { status: "refunded" },
      validationLevel: "strict",
      validationAction: "error",
    });
    const interrupted = runSeed([]);
    assert.equal(interrupted.status, 1, interrupted.stderr);
    assert.equal(await count({}), 1, "the second purchase insert is rejected after the first succeeds");
    assert.equal(await holds.countDocuments({ catalogVersion: "seed" }), 2);

    await connection.db.command({ collMod: "shoppurchases", validator: {} });
    const completedOrder = await purchases().findOne({ catalogVersion: "seed" });
    await purchases().updateOne({ _id: completedOrder._id }, { $set: { status: "paid" } });

    const recovered = runSeed(["--if-empty"]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(await count({}), 11);
    assert.equal(await count({ status: "paid" }), 2, "the officer edit and original paid order remain");
    assert.equal(await count({ status: "refunded" }), 0);
    assert.equal(await holds.countDocuments({ catalogVersion: "seed" }), 11);
    assert.equal(await holds.countDocuments({ catalogVersion: "seed", purchaseId: null }), 0);
    assert.equal(await users.countDocuments({ uNetId: /^seed-/ }), 5);
    assert.ok(await users.findOne({ _id: nonseedUser.insertedId }));
    assert.ok(await purchases().findOne({ _id: nonseedPurchase.insertedId }));
  });

  it("repairs a completed purchase whose hold link was interrupted", async () => {
    const holds = connection.collection("shopholds");
    await connection.db.command({
      collMod: "shopholds",
      validator: { purchaseId: null },
      validationLevel: "strict",
      validationAction: "error",
    });
    const interrupted = runSeed([]);
    assert.equal(interrupted.status, 1, interrupted.stderr);
    assert.equal(await count({}), 1);
    assert.equal(await holds.countDocuments({ catalogVersion: "seed", purchaseId: null }), 1);

    await connection.db.command({ collMod: "shopholds", validator: {} });
    const recovered = runSeed(["--if-empty"]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(await count({}), 11);
    assert.equal(await holds.countDocuments({ catalogVersion: "seed" }), 11);
    assert.equal(await holds.countDocuments({ catalogVersion: "seed", purchaseId: null }), 0);
  });

  it("resumes when an interrupted seed left only some students", async () => {
    await connection.db.command({
      collMod: "users",
      validator: { uNetId: "seed-etran" },
      validationLevel: "strict",
      validationAction: "error",
    });
    const interrupted = runSeed([]);
    assert.equal(interrupted.status, 1, interrupted.stderr);
    assert.equal(await connection.collection("users").countDocuments({ uNetId: /^seed-/ }), 1);
    assert.equal(await count({}), 0);

    await connection.db.command({ collMod: "users", validator: {} });
    await connection.collection("users").updateOne(
      { uNetId: "seed-etran" },
      { $set: { uDisplayName: "Edited seed student" } }
    );
    const recovered = runSeed(["--if-empty"]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(await count({}), 11);
    assert.equal(await connection.collection("users").countDocuments({ uNetId: /^seed-/ }), 5);
    assert.equal(
      (await connection.collection("users").findOne({ uNetId: "seed-etran" })).uDisplayName,
      "Edited seed student"
    );
  });

  it("keeps concurrent partial --if-empty recoveries to one fixture set", async () => {
    const users = connection.collection("users");
    const holds = connection.collection("shopholds");
    const nonseedUser = await users.insertOne({ uNetId: "concurrency-qa" });
    const nonseedPurchase = await purchases().insertOne({
      holdId: new mongoose.Types.ObjectId(),
      catalogVersion: "qa-concurrency",
      status: "paid",
    });

    await connection.db.command({
      collMod: "shoppurchases",
      validator: { status: "refunded" },
      validationLevel: "strict",
      validationAction: "error",
    });
    const interrupted = runSeed([]);
    assert.equal(interrupted.status, 1, interrupted.stderr);
    assert.equal(await count({}), 1);
    await connection.db.command({ collMod: "shoppurchases", validator: {} });

    const removedInterruptedHold = await holds.deleteOne({ catalogVersion: "seed", purchaseId: null });
    assert.equal(removedInterruptedHold.deletedCount, 1);
    const completedOrder = await purchases().findOne({ catalogVersion: "seed" });
    const completedHold = await holds.findOne({ _id: completedOrder.holdId });
    assert.equal(String(completedHold.purchaseId), String(completedOrder._id));
    await purchases().updateOne({ _id: completedOrder._id }, { $set: { status: "paid" } });

    const extra = 200;
    const [first, second] = await Promise.all([
      runSeedAsync(["--if-empty", "--extra", String(extra)]),
      runSeedAsync(["--if-empty", "--extra", String(extra)]),
    ]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);

    const expected = 11 + extra;
    const seededPurchases = await purchases().find({ catalogVersion: "seed" }).toArray();
    const seededHolds = await holds.find({ catalogVersion: "seed" }).toArray();
    assert.equal(seededPurchases.length, expected);
    assert.equal(new Set(seededPurchases.map((purchase) => String(purchase.holdId))).size, expected);
    assert.equal(seededHolds.length, expected);
    assert.equal(seededHolds.filter((hold) => hold.purchaseId == null).length, 0);
    const holdById = new Map(seededHolds.map((hold) => [String(hold._id), hold]));
    for (const purchase of seededPurchases) {
      const hold = holdById.get(String(purchase.holdId));
      assert.ok(hold, `hold for purchase ${purchase._id} exists`);
      assert.equal(String(hold.purchaseId), String(purchase._id));
      assert.equal(String(hold.userId), String(purchase.userId));
    }
    const hkim = await users.findOne({ uNetId: "seed-hkim" });
    const hkimCrewnecks = seededPurchases.filter((purchase) =>
      String(purchase.userId) === String(hkim._id) && purchase.lines.some((line) => line.sku === "info-crewneck")
    );
    const dayOffsets = hkimCrewnecks
      .map((purchase) => purchase.createdAt - purchase.confirmedAt)
      .filter((age) => [6, 10].some((daysAgo) => Math.abs(age - daysAgo * 24 * 60 * 60 * 1000) <= 15 * 60 * 1000))
      .sort((left, right) => left - right);
    assert.equal(dayOffsets.length, 2, "the base Hannah crewneck fixtures retain their original day offsets");
    assert.ok(Math.abs(dayOffsets[0] - 6 * 24 * 60 * 60 * 1000) <= 15 * 60 * 1000);
    assert.ok(Math.abs(dayOffsets[1] - 10 * 24 * 60 * 60 * 1000) <= 15 * 60 * 1000);
    assert.equal(await count({ status: "paid" }), 2);
    assert.equal(await count({ status: "refunded" }), 0);
    await assertCountersMatchHoldingOrders();
    assert.equal(await users.countDocuments({ uNetId: /^seed-/ }), 5);
    assert.ok(await users.findOne({ _id: nonseedUser.insertedId }));
    assert.ok(await purchases().findOne({ _id: nonseedPurchase.insertedId }));
  });

  it("resumes and skips an intact --extra run when retried with the same count", async () => {
    const extra = 3;
    const holds = connection.collection("shopholds");
    await connection.db.command({
      collMod: "shoppurchases",
      validator: { status: "refunded" },
      validationLevel: "strict",
      validationAction: "error",
    });
    const interrupted = runSeed(["--extra", String(extra)]);
    assert.equal(interrupted.status, 1, interrupted.stderr);
    assert.equal(await count({}), 1);

    await connection.db.command({ collMod: "shoppurchases", validator: {} });
    const recovered = runSeed(["--if-empty", "--extra", String(extra)]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(await count({}), 11 + extra);
    assert.equal(await holds.countDocuments({ catalogVersion: "seed" }), 11 + extra);
    assert.equal(await holds.countDocuments({ catalogVersion: "seed", purchaseId: null }), 0);

    await purchases().updateOne({ catalogVersion: "seed", status: "refunded" }, { $set: { status: "paid" } });
    const restarted = runSeed(["--if-empty", "--extra", String(extra)]);
    assert.equal(restarted.status, 0, restarted.stderr);
    assert.match(restarted.stdout, /skipping/);
    assert.equal(await count({}), 11 + extra);
    assert.equal(await count({ status: "paid" }), 2);
    assert.equal(await count({ status: "refunded" }), 0);
  });

  it("does not adopt a later deterministic hold for an earlier matching order", async () => {
    const reset = runSeed([]);
    assert.equal(reset.status, 0, reset.stderr);
    await purchases().deleteMany({ catalogVersion: "seed" });
    await connection.collection("shopholds").deleteMany({ catalogVersion: "seed" });
    await connection.collection("users").deleteMany({ uNetId: /^seed-/ });

    await connection.db.command({
      collMod: "shoppurchases",
      validator: {
        $nor: [{
          status: "pending",
          venmoUsername: "hannah.kim.22",
          lines: { $elemMatch: { sku: "info-crewneck", quantity: 1 } },
        }],
      },
      validationLevel: "strict",
      validationAction: "error",
    });
    const interrupted = runSeed(["--if-empty"]);
    assert.equal(interrupted.status, 1, interrupted.stderr);
    assert.equal(await count({}), 9, "the later Hannah crewneck hold is left unpaired");

    await connection.db.command({ collMod: "shoppurchases", validator: {} });
    const first = await purchases().findOne({ catalogVersion: "seed", status: "refunded" });
    const second = await purchases().findOne({
      catalogVersion: "seed",
      status: "not_paid",
      "lines.sku": "info-tote-bag",
    });
    const laterHold = await connection.collection("shopholds").findOne({
      catalogVersion: "seed",
      purchaseId: null,
    });
    assert.ok(first);
    assert.ok(second);
    assert.ok(laterHold);
    assert.equal(await count({}), 9);

    const prefixIds = [first._id, second._id];
    const keptHoldIds = [first.holdId, second.holdId, laterHold._id];
    await purchases().deleteMany({ catalogVersion: "seed", _id: { $nin: prefixIds } });
    await connection.collection("shopholds").deleteMany({
      catalogVersion: "seed",
      _id: { $nin: keptHoldIds },
    });
    assert.equal(await count({}), 2, "the retry sees the same completed prefix as a delayed process");

    const recovered = runSeed(["--if-empty"]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(await count({}), 11);
    const hkim = await connection.collection("users").findOne({ uNetId: "seed-hkim" });
    const crewnecks = await purchases().find({
      catalogVersion: "seed",
      userId: hkim._id,
      "lines.sku": "info-crewneck",
    }).toArray();
    assert.equal(crewnecks.length, 2);
    crewnecks.sort((left, right) => left.confirmedAt - right.confirmedAt);
    assert.equal(crewnecks[1].confirmedAt - crewnecks[0].confirmedAt, 4 * 24 * 60 * 60 * 1000);
  });

  it("a plain run writes stock counters on the seed drop that match its holding orders", async () => {
    const reset = runSeed([]);
    assert.equal(reset.status, 0, reset.stderr);
    assert.equal(await count({ catalogId: REAL_DROP }), 0, "no seeded order is on the checkout drop");
    await assertCountersMatchHoldingOrders();
    for (const row of await shopCapacities().find({ catalogId: SEED_DROP }).toArray()) {
      assert.ok(row.reservedUnits <= DROP_UNIT_CAP, `${row.sku} stays within the drop cap`);
    }
    for (const row of await studentUnits().find({ units: { $gt: 0 } }).toArray()) {
      assert.ok(row.units <= PER_STUDENT_LIMIT, `${row.sku} stays within the per-student limit`);
    }
  });

  it("an officer can drop a seeded order, including one with no account, and take it back", async () => {
    const reset = runSeed([]);
    assert.equal(reset.status, 0, reset.stderr);
    const orders = await purchases().find({ catalogVersion: "seed", status: { $in: HOLDING } }).toArray();
    for (const order of orders) {
      const dropped = await setStatus(order._id, "not_paid");
      assert.equal(dropped.status, "not_paid", `order ${order._id} dropped`);
    }
    await assertCountersMatchHoldingOrders();

    const noAccount = await purchases().findOne({ catalogVersion: "seed", venmoUsername: "tnguyen_01" });
    assert.ok(noAccount);
    assert.equal(await users().countDocuments({ _id: noAccount.userId }), 0, "this buyer has no user record");
    const taken = await setStatus(noAccount._id, "pending");
    assert.equal(taken.status, "pending");
    await assertCountersMatchHoldingOrders();
  });

  it("dropping and taking back a seeded order moves the counters by its quantities", async () => {
    const reset = runSeed([]);
    assert.equal(reset.status, 0, reset.stderr);
    const order = await holdingOrder({ venmoUsername: "etran-22", status: "pending" });
    assert.ok(order);
    const reservedBefore = await shopCapacities().find({ catalogId: SEED_DROP }).toArray();
    const reservedBySku = new Map(reservedBefore.map((row) => [row.sku, row.reservedUnits]));

    await setStatus(order._id, "not_paid");
    for (const line of order.lines) {
      const row = await shopCapacities().findOne({ catalogId: SEED_DROP, sku: line.sku });
      assert.equal(row.reservedUnits, reservedBySku.get(line.sku) - line.quantity, `${line.sku} released`);
    }

    await setStatus(order._id, "pending");
    for (const line of order.lines) {
      const row = await shopCapacities().findOne({ catalogId: SEED_DROP, sku: line.sku });
      assert.equal(row.reservedUnits, reservedBySku.get(line.sku), `${line.sku} taken again`);
    }
    await assertCountersMatchHoldingOrders();
  });

  it("dropping and taking back a seeded order never touches the checkout drop's counters", async () => {
    const reset = runSeed([]);
    assert.equal(reset.status, 0, reset.stderr);
    const realHoodie = await shopCapacities().insertOne({ catalogId: REAL_DROP, sku: "info-hoodie", reservedUnits: 7 });
    const realUnits = await studentUnits().insertOne({ userId: new mongoose.Types.ObjectId(), sku: "info-hoodie", units: 2 });
    try {
      const order = await holdingOrder({ "lines.sku": "info-hoodie" });
      await setStatus(order._id, "not_paid");
      await setStatus(order._id, "pending");
      const resumed = runSeed(["--if-empty"]);
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.equal((await shopCapacities().findOne({ _id: realHoodie.insertedId })).reservedUnits, 7);
      assert.equal((await studentUnits().findOne({ _id: realUnits.insertedId })).units, 2);
      assert.equal(await shopCapacities().countDocuments({ catalogId: REAL_DROP }), 1, "no checkout counters were created");
    } finally {
      await shopCapacities().deleteOne({ _id: realHoodie.insertedId });
      await studentUnits().deleteOne({ _id: realUnits.insertedId });
    }
  });

  it("a plain run replaces the seed counters, removing rows left from the previous seed", async () => {
    const reset = runSeed([]);
    assert.equal(reset.status, 0, reset.stderr);
    const oldBuyerIds = [
      ...(await users().find({ uNetId: /^seed-/ }).project({ _id: 1 }).toArray()).map((user) => user._id),
      ...(await purchases().find({ catalogVersion: "seed" }).project({ userId: 1 }).toArray()).map((order) => order.userId),
    ];
    await shopCapacities().insertOne({ catalogId: SEED_DROP, sku: "retired-sku", reservedUnits: 3 });

    const replaced = runSeed([]);
    assert.equal(replaced.status, 0, replaced.stderr);
    assert.equal(await shopCapacities().countDocuments({ sku: "retired-sku" }), 0);
    assert.equal(await studentUnits().countDocuments({ userId: { $in: oldBuyerIds } }), 0, "counters for the replaced buyers are gone");
    await assertCountersMatchHoldingOrders();
  });

  it("--if-empty after an officer dropped a seeded order keeps the counters consistent", async () => {
    const reset = runSeed([]);
    assert.equal(reset.status, 0, reset.stderr);
    const dropped = await holdingOrder({ venmoUsername: "etran-22", "lines.sku": "info-hoodie" });
    await setStatus(dropped._id, "not_paid");

    // Remove the last seeded order, so the next --if-empty run has to write it again.
    const last = await purchases().findOne({ catalogVersion: "seed", venmoUsername: "etran-22", "lines.sku": "info-baseball-tee" });
    await connection.collection("shopholds").deleteOne({ _id: last.holdId });
    await purchases().deleteOne({ _id: last._id });

    const resumed = runSeed(["--if-empty"]);
    assert.equal(resumed.status, 0, resumed.stderr);
    assert.equal(await count({}), 11);
    assert.equal((await purchases().findOne({ _id: dropped._id })).status, "not_paid", "the officer's drop is kept");
    await assertCountersMatchHoldingOrders();
  });

  it("--if-empty moves seeded orders off a checkout drop id left by an earlier seed", async () => {
    const reset = runSeed([]);
    assert.equal(reset.status, 0, reset.stderr);
    await purchases().updateMany({ catalogVersion: "seed" }, { $set: { catalogId: REAL_DROP } });
    await connection.collection("shopholds").updateMany({ catalogVersion: "seed" }, { $set: { catalogId: REAL_DROP } });
    await shopCapacities().deleteMany({ catalogId: SEED_DROP });
    const realHoodie = await shopCapacities().insertOne({ catalogId: REAL_DROP, sku: "info-hoodie", reservedUnits: 7 });
    try {
      const resumed = runSeed(["--if-empty"]);
      assert.equal(resumed.status, 0, resumed.stderr);
      assert.equal(await count({ catalogId: REAL_DROP }), 0, "seeded orders leave the checkout drop");
      assert.equal((await shopCapacities().findOne({ _id: realHoodie.insertedId })).reservedUnits, 7);
      await assertCountersMatchHoldingOrders();
    } finally {
      await shopCapacities().deleteOne({ _id: realHoodie.insertedId });
    }
  });
});
