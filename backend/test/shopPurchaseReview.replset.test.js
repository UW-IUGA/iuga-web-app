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
  shopStudentCheckoutsSchema,
  shopStudentUnitsSchema,
  usersSchema,
} from "../schemas/schemas.js";
import { createHold } from "../routes/api/v1/utils/shopCheckoutStore.js";
import { invalidateLimits } from "../routes/api/v1/utils/shopLimits.js";
import {
  addNote,
  countPurchases,
  getPurchase,
  listPurchases,
  listReadyForPickup,
  setFollowUp,
  setAmountReceived,
  setPaymentStatus,
  setPickup,
  ShopReviewError,
} from "../routes/api/v1/utils/shopPurchaseReview.js";

// Runs only against a real replica set. Start one with
// scripts/start-replica-set-mongodb.sh and pass SHOP_REPLSET_URI.
const uri = process.env.SHOP_REPLSET_URI;
const run = uri ? describe : describe.skip;

const CONFLICT = /Another officer updated this order/;

run("shop purchase review on a replica set", () => {
  let connection;
  let models;
  let officerId;

  before(async () => {
    connection = await mongoose.createConnection(uri, {
      dbName: `shop_review_${Date.now()}`,
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
    await models.ShopPurchases.init();
    const officer = await models.Users.create({ uFirstName: "Olive", uLastName: "Officer", uType: "Admin" });
    officerId = officer._id;
  });

  after(async () => {
    await connection.dropDatabase();
    await connection.close();
  });

  // Each test gets its own drop and buyers, so tests cannot share counters or search results.
  function testDrop() {
    return `test-${new mongoose.Types.ObjectId().toHexString()}`;
  }

  function line(sku, quantity = 1, size = "M", unitPriceCents = 3200) {
    return { sku, name: sku, size, quantity, unitPriceCents };
  }

  async function buyer(fields = {}) {
    return models.Users.create({
      uFirstName: "Example",
      uLastName: "Student",
      uEmail: `${new mongoose.Types.ObjectId().toHexString()}@uw.edu`,
      uPhoneNumber: "2065550100",
      uVenmoUsername: "private-profile-name",
      ...fields,
    });
  }

  // Inserted with the raw driver so review fields are absent, as on purchases saved before this feature.
  async function legacyPurchase({ userId, catalogId, lines, status = "pending", confirmedAt = new Date(), venmoUsername = "example-student" }) {
    const _id = new mongoose.Types.ObjectId();
    await models.ShopPurchases.collection.insertOne({
      _id,
      holdId: new mongoose.Types.ObjectId(),
      userId,
      catalogId,
      catalogVersion: "test-v1",
      venmoUsername,
      lines,
      totalCents: lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0),
      status,
      confirmedAt,
    });
    return _id;
  }

  async function seedCounters({ catalogId, userId, sku, reservedUnits, units }) {
    await models.ShopCapacity.create({ catalogId, sku, reservedUnits });
    await models.ShopStudentUnits.create({ userId, sku, units });
  }

  async function counts(catalogId, userId, sku) {
    const capacity = await models.ShopCapacity.findOne({ catalogId, sku }).lean();
    const student = await models.ShopStudentUnits.findOne({ userId, sku }).lean();
    return { reserved: capacity?.reservedUnits ?? null, units: student?.units ?? null };
  }

  async function assertReviewError(promise, status, messagePattern) {
    await assert.rejects(promise, (error) => {
      assert.ok(error instanceof ShopReviewError, `expected ShopReviewError, got ${error?.name}: ${error?.message}`);
      assert.equal(error.status, status);
      if (messagePattern) assert.match(error.message, messagePattern);
      return true;
    });
  }

  // Asserts the 500 counter error and the facts it carries for the server log (no buyer fields).
  async function assertCounterError(promise, details) {
    await assert.rejects(promise, (error) => {
      assert.ok(error instanceof ShopReviewError, `expected ShopReviewError, got ${error?.name}: ${error?.message}`);
      assert.equal(error.status, 500);
      assert.deepEqual(error.details, details);
      return true;
    });
  }

  function pay(purchaseId, status, expectedRevision, note) {
    return setPaymentStatus(models, { purchaseId, status, note, expectedRevision, changedBy: officerId, nowMs: Date.now() });
  }

  function receive(purchaseId, amountReceivedCents, expectedRevision) {
    return setAmountReceived(models, { purchaseId, amountReceivedCents, expectedRevision, changedBy: officerId, nowMs: Date.now() });
  }

  describe("listing", () => {
    it("lists pending orders oldest first in bounded pages with every saved line", async () => {
      const catalogId = testDrop();
      const student = await buyer({ uFirstName: "Paging", uLastName: "Tester" });
      const sameTime = new Date("2030-01-01T10:00:00Z");
      const ids = [];
      for (let i = 0; i < 3; i += 1) {
        ids.push(await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie"), line("info-tote-bag", 2, "One Size", 2000)], confirmedAt: sameTime }));
      }
      const older = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], confirmedAt: new Date("2029-12-31T10:00:00Z") });
      await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "paid", confirmedAt: new Date("2029-12-30T10:00:00Z") });

      const q = "paging tester";
      const first = await listPurchases(models, { status: "pending", followUp: "all", q, limit: 2 });
      const second = await listPurchases(models, { status: "pending", followUp: "all", q, limit: 2, cursor: first.nextCursor });

      const order = [older, ...ids.sort((a, b) => a.toHexString().localeCompare(b.toHexString()))].map(String);
      assert.deepEqual(first.purchases.map((p) => String(p._id)), order.slice(0, 2));
      assert.deepEqual(second.purchases.map((p) => String(p._id)), order.slice(2, 4));
      assert.equal(second.nextCursor, null);
      const shown = second.purchases[1];
      assert.deepEqual(shown.lines.map((l) => [l.sku, l.size, l.quantity, l.unitPriceCents]), [
        ["info-hoodie", "M", 1, 3200],
        ["info-tote-bag", "One Size", 2, 2000],
      ]);
      assert.equal(shown.totalCents, 7200);
      assert.equal(shown.reviewRevision, 0);
      assert.equal(shown.followUpStatus, null);
    });

    it("finds a buyer by name, email, or saved Venmo username across the whole list, case-insensitively", async () => {
      const catalogId = testDrop();
      const target = await buyer({ uFirstName: "Quinn", uLastName: "Searchable", uEmail: "quinn.searchable@uw.edu" });
      const other = await buyer();
      for (let i = 0; i < 4; i += 1) {
        await legacyPurchase({ userId: other._id, catalogId, lines: [line("info-hoodie")], confirmedAt: new Date(`2020-01-0${i + 1}T00:00:00Z`) });
      }
      const targetId = await legacyPurchase({ userId: target._id, catalogId, lines: [line("info-hoodie")], venmoUsername: "quinn-venmo", confirmedAt: new Date("2031-01-01T00:00:00Z") });

      for (const q of ["QUINN SEARCHABLE", "quinn.searchable@", "Quinn-Venmo"]) {
        const { purchases } = await listPurchases(models, { status: "all", followUp: "all", q, limit: 1 });
        assert.deepEqual(purchases.map((p) => String(p._id)), [String(targetId)], `search "${q}"`);
      }
    });

    it("treats search text literally", async () => {
      const result = await listPurchases(models, { status: "all", followUp: "all", q: ".*", limit: 50 });
      assert.deepEqual(result.purchases, []);
    });

    it("returns the buyer's name and email only, and keeps orders whose buyer no longer exists", async () => {
      const catalogId = testDrop();
      const student = await buyer({ uFirstName: "Private", uLastName: "Fields" });
      const goneUserId = new mongoose.Types.ObjectId();
      await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], venmoUsername: "fields-check" });
      const orphan = await legacyPurchase({ userId: goneUserId, catalogId, lines: [line("info-hoodie")], venmoUsername: "orphan-check" });

      const [withBuyer] = (await listPurchases(models, { status: "all", followUp: "all", q: "fields-check", limit: 5 })).purchases;
      assert.deepEqual(withBuyer.buyer, { id: String(student._id), name: "Private Fields", email: student.uEmail, firstName: "Private", lastName: "Fields", preferredName: null });

      const [withoutBuyer] = (await listPurchases(models, { status: "all", followUp: "all", q: "orphan-check", limit: 5 })).purchases;
      assert.equal(String(withoutBuyer._id), String(orphan));
      assert.equal(withoutBuyer.buyer, null);
    });

    it("filters by follow-up and rejects a cursor from a different search", async () => {
      const catalogId = testDrop();
      const student = await buyer({ uFirstName: "Follow", uLastName: "Filter" });
      const waiting = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await setFollowUp(models, { purchaseId: waiting, followUpStatus: "contacted", expectedRevision: 0, changedBy: officerId, nowMs: Date.now() });

      const awaiting = await listPurchases(models, { status: "pending", followUp: "awaiting", q: "follow filter", limit: 5 });
      const none = await listPurchases(models, { status: "pending", followUp: "none", q: "follow filter", limit: 5 });
      assert.deepEqual(awaiting.purchases.map((p) => String(p._id)), [String(waiting)]);
      assert.equal(none.purchases.length, 1);
      assert.notEqual(String(none.purchases[0]._id), String(waiting));

      const page = await listPurchases(models, { status: "all", followUp: "all", q: "", limit: 1 });
      await assertReviewError(
        listPurchases(models, { status: "paid", followUp: "all", q: "", limit: 1, cursor: page.nextCursor }),
        400,
      );
      await assertReviewError(listPurchases(models, { status: "all", followUp: "all", q: "", limit: 1, cursor: "not-a-cursor" }), 400);
    });

    it("reports a missing purchase as not found", async () => {
      await assertReviewError(getPurchase(models, new mongoose.Types.ObjectId()), 404);
    });

    it("gives one order the buyer's phone number for follow-up, which the list never includes", async () => {
      const catalogId = testDrop();
      const student = await buyer({ uFirstName: "Phone", uLastName: "Contact" });
      const noPhone = await buyer({ uFirstName: "Phone", uLastName: "Missing", uPhoneNumber: null });
      const withPhoneId = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], venmoUsername: "phone-contact" });
      const noPhoneId = await legacyPurchase({ userId: noPhone._id, catalogId, lines: [line("info-hoodie")] });

      assert.deepEqual((await getPurchase(models, withPhoneId)).buyer, {
        id: String(student._id),
        name: "Phone Contact",
        email: student.uEmail,
        firstName: "Phone",
        lastName: "Contact",
        preferredName: null,
        phone: "2065550100",
      });
      assert.equal((await getPurchase(models, noPhoneId)).buyer.phone, null);
      assert.equal((await pay(withPhoneId, "paid", 0)).buyer.phone, "2065550100", "a decision returns the refreshed order with its contact");

      const [listed] = (await listPurchases(models, { status: "all", followUp: "all", q: "phone-contact", limit: 5 })).purchases;
      assert.equal("phone" in listed.buyer, false);
    });

    it("counts orders by status, pickup, short payment, and follow-up, and totals what pending orders owe and paid orders received", async () => {
      const before = await countPurchases(models);
      const catalogId = testDrop();
      const student = await buyer();
      const order = (status, lines = [line("info-hoodie")]) => legacyPurchase({ userId: student._id, catalogId, lines, status });
      await order("pending", [line("info-hoodie", 2)]);
      const short = await order("pending");
      const waiting = await order("pending");
      const saysPaid = await order("pending");
      const overpaid = await order("paid");
      const handedOver = await order("paid");
      const dropped = await order("not_paid");
      await order("refunded");
      // A refund recorded on a partly paid order keeps the amount, but nothing is owed, so it is not short.
      const refundedPartly = await order("refunded");
      await models.ShopPurchases.collection.updateOne({ _id: refundedPartly }, { $set: { amountReceivedCents: 1000 } });
      // Confirmed counts what arrived, so an overpaid order adds its full amount, not its total.
      await models.ShopPurchases.collection.updateOne({ _id: overpaid }, { $set: { amountReceivedCents: 4000 } });
      await receive(short, 1200, 0);
      await receive(dropped, 1000, 0);
      await setFollowUp(models, { purchaseId: waiting, followUpStatus: "contacted", expectedRevision: 0, changedBy: officerId, nowMs: Date.now() });
      await setFollowUp(models, { purchaseId: saysPaid, followUpStatus: "says_paid", expectedRevision: 0, changedBy: officerId, nowMs: Date.now() });
      await setPickup(models, { purchaseId: handedOver, pickedUp: true, expectedRevision: 0, changedBy: officerId, nowMs: Date.now() });

      const after = await countPurchases(models);
      const change = (group) => Object.fromEntries(Object.keys(after[group]).map((key) => [key, after[group][key] - before[group][key]]));
      assert.deepEqual(change("counts"), {
        pending: 4, paid: 2, ready: 1, picked_up: 1, not_paid: 1, refunded: 2, all: 9, short: 2, awaiting: 2, says_paid: 1,
      });
      assert.deepEqual(change("totals"), {
        expectedCents: 6400 + 3200 + 3200 + 3200,
        receivedCents: 1200,
        owedCents: 6400 + 2000 + 3200 + 3200,
        pendingOrders: 4,
        receivedOrders: 1,
        // The overpaid order's 4000 received, plus the handed-over order's total (saved without an amount received).
        // Refunded orders, even partly paid ones, are left out.
        confirmedCents: 4000 + 3200,
      });
    });

    it("splits paid orders into ready for pickup and picked up, in pages that keep the pickup filter", async () => {
      const catalogId = testDrop();
      const student = await buyer({ uFirstName: "Pickup", uLastName: "Filter" });
      const order = (status = "paid") => legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status });
      const firstReady = await order();
      const pickedUp = await order();
      const secondReady = await order();
      await order("pending");
      await setPickup(models, { purchaseId: pickedUp, pickedUp: true, expectedRevision: 0, changedBy: officerId, nowMs: Date.now() });

      const query = { status: "paid", balance: "all", followUp: "all", q: "pickup filter" };
      const first = await listPurchases(models, { ...query, pickup: "ready", limit: 1 });
      const second = await listPurchases(models, { ...query, pickup: "ready", limit: 1, cursor: first.nextCursor });
      assert.deepEqual([...first.purchases, ...second.purchases].map((p) => String(p._id)), [String(firstReady), String(secondReady)]);
      assert.equal(second.nextCursor, null);

      const handedOver = await listPurchases(models, { ...query, pickup: "picked_up", limit: 5 });
      assert.deepEqual(handedOver.purchases.map((p) => String(p._id)), [String(pickedUp)]);
      await assertReviewError(listPurchases(models, { ...query, pickup: "picked_up", limit: 1, cursor: first.nextCursor }), 400);
    });

    it("finds Unpaid and Dropped orders paid short, not refunded ones, in pages that keep the short filter", async () => {
      const catalogId = testDrop();
      const student = await buyer({ uFirstName: "Short", uLastName: "Payer" });
      const order = (status = "pending") => legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status });
      const firstShort = await order();
      const secondShort = await order("not_paid");
      const covered = await order();
      await order();
      await receive(firstShort, 1000, 0);
      await receive(secondShort, 3100, 0);
      await receive(covered, 3200, 0);
      const refundedPartly = await order("refunded");
      await models.ShopPurchases.collection.updateOne({ _id: refundedPartly }, { $set: { amountReceivedCents: 1000 } });

      const query = { status: "all", balance: "short", followUp: "all", q: "short payer" };
      const first = await listPurchases(models, { ...query, limit: 1 });
      const second = await listPurchases(models, { ...query, limit: 1, cursor: first.nextCursor });
      assert.deepEqual([...first.purchases, ...second.purchases].map((p) => String(p._id)), [String(firstShort), String(secondShort)]);
      assert.equal(second.nextCursor, null);

      const pendingShort = await listPurchases(models, { ...query, status: "pending", limit: 5 });
      assert.deepEqual(pendingShort.purchases.map((p) => String(p._id)), [String(firstShort)]);
      await assertReviewError(listPurchases(models, { ...query, balance: "all", limit: 1, cursor: first.nextCursor }), 400);
    });
  });

  describe("payment decisions", () => {
    it("marks a legacy pending order paid without changing stock and records who did it", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 3, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });

      const paid = await pay(id, "paid", 0);

      assert.equal(paid.status, "paid");
      assert.equal(paid.reviewRevision, 1);
      assert.equal(paid.amountReceivedCents, 3200, "marking paid records the full amount as received");
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 3, units: 1 });
      assert.deepEqual(paid.recentHistory.map((h) => [h.kind, h.from, h.to, h.actorName]), [
        ["amount_received", "none", "3200", "Olive Officer"],
        ["payment", "pending", "paid", "Olive Officer"],
      ]);
    });

    it("drops an unpaid order and returns stock and allowance once, summing sizes of one product", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 5, units: 3 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 1, "M"), line("info-hoodie", 2, "L")] });

      await pay(id, "not_paid", 0);
      await assertReviewError(pay(id, "not_paid", 0), 409, CONFLICT);

      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 2, units: 0 });
      assert.equal((await getPurchase(models, id)).status, "not_paid");
    });

    it("lets only one of two officers with the same revision decide, releasing stock once", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 4, units: 2 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)] });

      const results = await Promise.allSettled([pay(id, "not_paid", 0), pay(id, "refunded", 0)]);

      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = results.find((r) => r.status === "rejected");
      assert.equal(rejected.reason.status, 409);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 2, units: 0 });
    });

    it("refuses a stale revision even when the requested status is already current", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await pay(id, "paid", 0);

      await assertReviewError(pay(id, "paid", 0), 409, CONFLICT);
      const unchanged = await pay(id, "paid", 1);
      assert.equal(unchanged.reviewRevision, 1, "a current no-op does not add history");
      assert.equal(unchanged.recentHistory.length, 2, "only the first mark-paid's amount and payment entries");
    });

    it("moves a dropped order back to unpaid by taking its items again, keeping the amount recorded", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 0, units: 0 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)], status: "not_paid" });
      await receive(id, 1000, 0);

      const unpaid = await pay(id, "pending", 1, "Dropped by mistake");

      assert.equal(unpaid.status, "pending");
      assert.equal(unpaid.amountReceivedCents, 1000);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 2, units: 2 });
      assert.deepEqual(unpaid.recentHistory.at(-1), {
        ...unpaid.recentHistory.at(-1), kind: "payment", from: "not_paid", to: "pending", note: "Dropped by mistake",
      });
    });

    it("leaves a dropped order dropped when its items no longer fit", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 24, units: 0 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "not_paid" });

      await assertReviewError(pay(id, "pending", 0), 409, /Not enough info-hoodie left.*Nothing changed/);
      assert.equal((await getPurchase(models, id)).status, "not_paid");
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 24, units: 0 });
    });

    it("undoes a recorded refund by taking the items again, or changes nothing when they no longer fit", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 24, units: 0 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "refunded" });

      await assertReviewError(pay(id, "paid", 0), 409, /Not enough info-hoodie left.*Nothing changed/);
      assert.equal((await getPurchase(models, id)).status, "refunded");

      await models.ShopCapacity.updateOne({ catalogId, sku: "info-hoodie" }, { $set: { reservedUnits: 23 } });
      const paid = await pay(id, "paid", 0);

      assert.equal(paid.status, "paid");
      assert.equal(paid.amountReceivedCents, 3200, "a paid order records its total as received");
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 24, units: 1 });
    });

    it("drops a paid order by returning its items and the amount recorded before it was paid", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 2, units: 2 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)] });
      await receive(id, 4000, 0);
      const paid = await pay(id, "paid", 1);
      assert.equal(paid.amountBeforePaidCents, 4000);

      const dropped = await pay(id, "not_paid", 2);

      assert.equal(dropped.status, "not_paid");
      assert.equal(dropped.amountReceivedCents, 4000);
      assert.equal(dropped.amountBeforePaidCents, undefined, "an amount below the total has nothing to restore");
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 0, units: 0 });
    });

    it("moves a refunded order back to unpaid with its items and the amount from before it was paid", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await receive(id, 1500, 0);
      await pay(id, "paid", 1);
      const refunded = await pay(id, "refunded", 2);
      assert.equal(refunded.amountReceivedCents, 3200, "a refund keeps the amount that was received");
      assert.equal(refunded.amountBeforePaidCents, 1500);

      const unpaid = await pay(id, "pending", 3);

      assert.equal(unpaid.amountReceivedCents, 1500);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 1, units: 1 });
    });

    it("switches between dropped and refunded without touching stock", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 0, units: 0 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "not_paid" });

      const refunded = await pay(id, "refunded", 0);
      const dropped = await pay(id, "not_paid", 1);

      assert.equal(refunded.status, "refunded");
      assert.equal(dropped.status, "not_paid");
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 0, units: 0 });
    });

    it("records a refund on a paid order and returns its stock", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 2, units: 2 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)], status: "paid" });

      const refunded = await pay(id, "refunded", 0);

      assert.equal(refunded.status, "refunded");
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 0, units: 0 });
    });

    describe("after pickup", () => {
      // A paid order handed over at the pickup table; the student holds its two hoodies.
      async function pickedUpPaid() {
        const catalogId = testDrop();
        const student = await buyer();
        await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 2, units: 2 });
        const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)], status: "paid" });
        const picked = await setPickup(models, { purchaseId: id, pickedUp: true, expectedRevision: 0, changedBy: officerId, nowMs: Date.now() });
        return { catalogId, student, id, revision: picked.reviewRevision, pickedUpAt: picked.pickedUpAt };
      }

      // Collects the console.warn lines written while `work` runs.
      async function warningsDuring(work) {
        const logged = [];
        const original = console.warn;
        console.warn = (...args) => logged.push(args.join(" "));
        try {
          await work();
        } finally {
          console.warn = original;
        }
        return logged;
      }

      it("refuses a refund without a reason and changes nothing", async () => {
        const { catalogId, student, id, revision } = await pickedUpPaid();

        await assertReviewError(pay(id, "refunded", revision), 409, /picked up, so the change needs a reason/);

        assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 2, units: 2 });
        const after = await getPurchase(models, id);
        assert.equal(after.status, "paid");
        assert.equal(after.reviewRevision, revision);
        assert.deepEqual(after.recentHistory.map((h) => h.kind), ["pickup"]);
      });

      it("refunds with a reason: returns stock, keeps the pickup mark, flags the history, and logs once without buyer details", async () => {
        const { catalogId, student, id, revision, pickedUpAt } = await pickedUpPaid();

        let refunded;
        const logged = await warningsDuring(async () => {
          refunded = await pay(id, "refunded", revision, "Returned the hoodie");
        });

        assert.equal(refunded.status, "refunded");
        assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 0, units: 0 });
        assert.equal(refunded.pickedUpAt.toISOString(), pickedUpAt.toISOString());
        const entry = refunded.recentHistory.at(-1);
        assert.deepEqual([entry.kind, entry.from, entry.to, entry.note, entry.afterPickup], [
          "payment", "paid", "refunded", "Returned the hoodie", true,
        ]);
        assert.equal(entry.actorName, "Olive Officer");
        assert.deepEqual(logged, [`Shop purchase changed after pickup: purchase ${id}, paid → refunded`]);
      });

      it("does not flag or log a refund of an order that was never picked up", async () => {
        const catalogId = testDrop();
        const student = await buyer();
        await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 2, units: 2 });
        const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)], status: "paid" });

        let refunded;
        const logged = await warningsDuring(async () => {
          refunded = await pay(id, "refunded", 0);
        });

        assert.equal(refunded.status, "refunded");
        assert.equal(refunded.recentHistory.at(-1).afterPickup, undefined);
        assert.deepEqual(logged, []);
      });
    });

    it("marks a dropped order paid again only when every item still fits", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 0, units: 0 });
      await seedCounters({ catalogId, userId: student._id, sku: "info-tote-bag", reservedUnits: 24, units: 0 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie"), line("info-tote-bag", 1, "One Size", 2000)], status: "not_paid" });

      await assertReviewError(pay(id, "paid", 0), 409, /Not enough info-tote-bag left.*Nothing changed/);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 0, units: 0 }, "the hoodie must roll back");
      assert.equal((await getPurchase(models, id)).status, "not_paid");

      await models.ShopCapacity.updateOne({ catalogId, sku: "info-tote-bag" }, { $set: { reservedUnits: 23 } });
      const paid = await pay(id, "paid", 0);
      assert.equal(paid.status, "paid");
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 1, units: 1 });
      assert.deepEqual(await counts(catalogId, student._id, "info-tote-bag"), { reserved: 24, units: 1 });
    });

    it("refuses to mark a dropped order paid past the student's limit", async () => {
      invalidateLimits();
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 5, units: 5 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "not_paid" });

      await assertReviewError(pay(id, "paid", 0), 409, /limited to 5 per student/);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 5, units: 5 });
    });

    it("lets a checkout and a reinstatement race for the last unit without overselling", async () => {
      invalidateLimits();
      const catalogId = testDrop();
      const student = await buyer();
      const shopper = new mongoose.Types.ObjectId();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 23, units: 0 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "not_paid" });

      await Promise.allSettled([
        pay(id, "paid", 0),
        createHold(models, { userId: shopper, catalogId, catalogVersion: "test-v1", lines: [line("info-hoodie")], nowMs: Date.now() }),
      ]);

      assert.equal((await counts(catalogId, student._id, "info-hoodie")).reserved, 24);
    });

    it("fails and changes nothing when a stock counter is missing or would go below zero", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      const missing = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await assertCounterError(pay(missing, "not_paid", 0), {
        purchaseId: String(missing), counter: "drop stock", reason: "missing", catalogId, sku: "info-hoodie", quantity: 1, current: null,
      });
      assert.equal((await getPurchase(models, missing)).status, "pending");

      await seedCounters({ catalogId, userId: student._id, sku: "info-tote-bag", reservedUnits: 1, units: 0 });
      const under = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-tote-bag", 1, "One Size", 2000)] });
      await assertCounterError(pay(under, "not_paid", 0), {
        purchaseId: String(under), counter: "student allowance", reason: "too low", catalogId, sku: "info-tote-bag", quantity: 1, current: 0,
      });
      assert.deepEqual(await counts(catalogId, student._id, "info-tote-bag"), { reserved: 1, units: 0 });
      assert.equal((await getPurchase(models, under)).reviewRevision, 0);

      await seedCounters({ catalogId, userId: student._id, sku: "info-cap", reservedUnits: 0, units: 1 });
      const stockShort = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-cap")] });
      await assertCounterError(pay(stockShort, "not_paid", 0), {
        purchaseId: String(stockShort), counter: "drop stock", reason: "too low", catalogId, sku: "info-cap", quantity: 1, current: 0,
      });
      assert.deepEqual(await counts(catalogId, student._id, "info-cap"), { reserved: 0, units: 1 });
    });

    it("clears an active follow-up when payment changes and records both changes", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await setFollowUp(models, { purchaseId: id, followUpStatus: "contacted", expectedRevision: 0, changedBy: officerId, nowMs: Date.now() });

      const paid = await pay(id, "paid", 1);

      assert.equal(paid.followUpStatus, null);
      assert.equal(paid.awaitingStudentReply, false);
      assert.equal(paid.reviewRevision, 2);
      assert.deepEqual(paid.recentHistory.map((h) => [h.kind, h.from, h.to]), [
        ["follow_up", "none", "contacted"],
        ["amount_received", "none", "3200"],
        ["payment", "pending", "paid"],
        ["follow_up", "contacted", "none"],
      ]);
    });
  });

  describe("moving a paid order back to unpaid", () => {
    it("restores the amount recorded before the order reached its total, and leaves stock and allowance as they were", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 2, units: 2 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)] });
      await receive(id, 4000, 0);
      await pay(id, "paid", 1);
      const stockWhilePaid = await counts(catalogId, student._id, "info-hoodie");
      assert.deepEqual(stockWhilePaid, { reserved: 2, units: 2 });

      const unpaid = await pay(id, "pending", 2);

      assert.equal(unpaid.status, "pending");
      assert.equal(unpaid.amountReceivedCents, 4000);
      assert.equal(unpaid.reviewRevision, 3);
      assert.deepEqual(unpaid.recentHistory.slice(-2).map((h) => [h.kind, h.from, h.to]), [
        ["amount_received", "6400", "4000"],
        ["payment", "paid", "pending"],
      ]);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), stockWhilePaid);
    });

    it("gives back nothing recorded when the order had no amount before it was marked paid", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await pay(id, "paid", 0);

      const unpaid = await pay(id, "pending", 1);

      assert.equal(unpaid.amountReceivedCents, null);
      assert.deepEqual(unpaid.recentHistory.slice(-2).map((h) => [h.kind, h.from, h.to]), [
        ["amount_received", "3200", "none"],
        ["payment", "paid", "pending"],
      ]);
    });

    it("restores the amount from before a covering amount was entered, when that entry is what made it paid", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 2, units: 2 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)] });
      await receive(id, 4000, 0);
      const paid = await receive(id, 6400, 1);
      assert.equal(paid.status, "paid");

      const unpaid = await pay(id, "pending", 2);

      assert.equal(unpaid.amountReceivedCents, 4000);
    });

    it("reports the amount Mark unpaid restores even when that entry is older than the newest 20 history entries", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await receive(id, 1000, 0);
      let current = await receive(id, 3200, 1);
      assert.equal(current.status, "paid");
      for (let check = 1; check <= 21; check += 1) {
        current = await addNote(models, {
          purchaseId: id,
          title: `Check ${check}`,
          expectedRevision: current.reviewRevision,
          changedBy: officerId,
          nowMs: Date.now(),
        });
      }

      const read = await getPurchase(models, id);

      assert.equal(read.recentHistory.length, 20);
      assert.ok(read.recentHistory.every((entry) => entry.kind === "note"), "the amount entry is outside the recent history");
      assert.equal(read.amountBeforePaidCents, 1000);
    });

    it("reports nothing to restore when no amount was recorded before the order was marked paid", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      const pending = await getPurchase(models, id);
      assert.equal(pending.amountBeforePaidCents, undefined, "a Pending order has no figure");

      const paid = await pay(id, "paid", 0);

      assert.equal(paid.amountBeforePaidCents, null);
    });

    it("saves the officer's reason on the payment entry, and not on the amount entry", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await pay(id, "paid", 0);

      const unpaid = await pay(id, "pending", 1, "Marked paid by mistake");

      const [amountEntry, paymentEntry] = unpaid.recentHistory.slice(-2);
      assert.equal(paymentEntry.kind, "payment");
      assert.equal(paymentEntry.note, "Marked paid by mistake");
      assert.equal(amountEntry.kind, "amount_received");
      assert.equal(amountEntry.note, undefined);
    });

    it("refuses a stale revision and changes nothing", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await pay(id, "paid", 0);
      const stockWhilePaid = await counts(catalogId, student._id, "info-hoodie");

      await assertReviewError(pay(id, "pending", 0), 409, CONFLICT);

      const unchanged = await getPurchase(models, id);
      assert.equal(unchanged.status, "paid");
      assert.equal(unchanged.amountReceivedCents, 3200);
      assert.equal(unchanged.reviewRevision, 1);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), stockWhilePaid);
    });

    it("can be marked paid again, moved back to unpaid, and then dropped, releasing its stock once", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 2, units: 2 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)] });
      await receive(id, 4000, 0);
      await pay(id, "paid", 1);
      const unpaid = await pay(id, "pending", 2);

      const paidAgain = await pay(id, "paid", unpaid.reviewRevision);
      assert.equal(paidAgain.status, "paid");
      assert.equal(paidAgain.amountReceivedCents, 6400);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 2, units: 2 });

      const unpaidAgain = await pay(id, "pending", paidAgain.reviewRevision);
      const dropped = await pay(id, "not_paid", unpaidAgain.reviewRevision);
      assert.equal(dropped.status, "not_paid");
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 0, units: 0 });
    });

    it("gives back nothing recorded when no earlier amount is on record, or when it would still cover the total", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      const withoutHistory = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "paid" });
      assert.equal((await pay(withoutHistory, "pending", 0)).amountReceivedCents, null);

      const coveredBefore = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "paid" });
      await models.ShopPurchases.collection.updateOne(
        { _id: coveredBefore },
        { $set: { amountReceivedCents: 3200, reviewRevision: 1, reviewHistory: [{ changedBy: officerId, at: new Date(), kind: "amount_received", from: "3500", to: "3200" }] } },
      );
      assert.equal((await pay(coveredBefore, "pending", 1)).amountReceivedCents, null);
    });
  });

  describe("amount received", () => {
    it("keeps a short payment pending, records the amount, and leaves stock alone", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 2, units: 2 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)] });

      const short = await receive(id, 5000, 0);

      assert.equal(short.status, "pending");
      assert.equal(short.amountReceivedCents, 5000);
      assert.equal(short.reviewRevision, 1);
      assert.deepEqual(short.recentHistory.map((h) => [h.kind, h.from, h.to]), [["amount_received", "none", "5000"]]);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 2, units: 2 });
    });

    it("marks the order paid once the amount received covers the total, clearing follow-up", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 2, units: 2 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie", 2)] });
      await receive(id, 5000, 0);
      await setFollowUp(models, { purchaseId: id, followUpStatus: "contacted", expectedRevision: 1, changedBy: officerId, nowMs: Date.now() });

      const paid = await receive(id, 6400, 2);

      assert.equal(paid.status, "paid");
      assert.equal(paid.amountReceivedCents, 6400);
      assert.equal(paid.followUpStatus, null);
      assert.equal(paid.awaitingStudentReply, false);
      assert.equal(paid.reviewRevision, 3);
      assert.deepEqual(paid.recentHistory.slice(-3).map((h) => [h.kind, h.from, h.to]), [
        ["amount_received", "5000", "6400"],
        ["payment", "pending", "paid"],
        ["follow_up", "contacted", "none"],
      ]);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 2, units: 2 });
    });

    it("keeps an overpayment as received, and marking paid never lowers it", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      const over = await receive(id, 4000, 0);
      assert.equal(over.status, "paid");
      assert.equal(over.amountReceivedCents, 4000);

      const other = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await receive(other, 1000, 0);
      assert.equal((await pay(other, "paid", 1)).amountReceivedCents, 3200, "marking paid raises a short amount to the total");
    });

    it("retakes stock when the full amount arrives for a dropped order, or changes nothing", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 24, units: 0 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "not_paid" });

      await assertReviewError(receive(id, 3200, 0), 409, /Not enough info-hoodie left/);
      const unchanged = await getPurchase(models, id);
      assert.equal(unchanged.status, "not_paid");
      assert.equal(unchanged.amountReceivedCents ?? null, null);
      assert.equal(unchanged.reviewRevision, 0);

      await models.ShopCapacity.updateOne({ catalogId, sku: "info-hoodie" }, { $set: { reservedUnits: 23 } });
      const shortDropped = await receive(id, 1000, 0);
      assert.equal(shortDropped.status, "not_paid", "a short amount does not reinstate a dropped order");
      const paid = await receive(id, 3200, 1);
      assert.equal(paid.status, "paid");
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 24, units: 1 });
    });

    it("refuses paid and refunded orders, stale revisions, and does nothing for the current amount", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      for (const status of ["paid", "refunded"]) {
        const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status });
        await assertReviewError(receive(id, 100, 0), 409);
      }
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await receive(id, 1000, 0);
      await assertReviewError(receive(id, 2000, 0), 409, CONFLICT);
      const same = await receive(id, 1000, 1);
      assert.equal(same.reviewRevision, 1);
      assert.equal(same.recentHistory.length, 1);
      await assertReviewError(receive(new mongoose.Types.ObjectId(), 1000, 0), 404);
    });
  });

  describe("follow-up", () => {
    function logFollowUp(purchaseId, followUpStatus, expectedRevision, { note, nowMs = Date.now() } = {}) {
      return setFollowUp(models, { purchaseId, followUpStatus, note, expectedRevision, changedBy: officerId, nowMs });
    }

    it("logs what happened with the student, with an optional note, without touching payment or stock", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      const at = Date.parse("2030-02-01T12:00:00Z");

      const contacted = await logFollowUp(id, "contacted", 0, { nowMs: at });
      assert.equal(contacted.followUpStatus, "contacted");
      assert.equal(contacted.awaitingStudentReply, true);
      assert.equal(contacted.followUpUpdatedByName, "Olive Officer");
      assert.equal(new Date(contacted.followUpUpdatedAt).getTime(), at);

      const promised = await logFollowUp(id, "will_pay", 1, { note: "Said she'll send it Friday." });
      assert.equal(promised.followUpStatus, "will_pay");
      assert.equal(promised.status, "pending");
      assert.deepEqual(promised.recentHistory.map((h) => [h.kind, h.from, h.to, h.note ?? null]), [
        ["follow_up", "none", "contacted", null],
        ["follow_up", "contacted", "will_pay", "Said she'll send it Friday."],
      ]);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 1, units: 1 });
    });

    it("records reaching out again as its own entry, and clears the follow-up", async () => {
      const student = await buyer();
      const id = await legacyPurchase({ userId: student._id, catalogId: testDrop(), lines: [line("info-hoodie")] });

      await logFollowUp(id, "contacted", 0);
      const again = await logFollowUp(id, "contacted", 1);
      assert.equal(again.reviewRevision, 2);
      assert.equal(again.recentHistory.length, 2);

      const cleared = await logFollowUp(id, "none", 2, { note: "Sorted out in person." });
      assert.equal(cleared.followUpStatus, null);
      assert.equal(cleared.awaitingStudentReply, false);
      assert.deepEqual(cleared.recentHistory.at(-1).note, "Sorted out in person.");

      const unchanged = await logFollowUp(id, "none", 3);
      assert.equal(unchanged.reviewRevision, 3, "clearing an order with no follow-up and no note records nothing");
    });

    it("refuses a stale revision", async () => {
      const student = await buyer();
      const id = await legacyPurchase({ userId: student._id, catalogId: testDrop(), lines: [line("info-hoodie")] });
      await logFollowUp(id, "contacted", 0);

      await assertReviewError(logFollowUp(id, "says_paid", 0), 409, CONFLICT);
      await assertReviewError(logFollowUp(new mongoose.Types.ObjectId(), "contacted", 0), 404);
    });

    it("reads an order marked awaiting a reply before follow-up statuses existed as contacted", async () => {
      const student = await buyer({ uFirstName: "Legacy", uLastName: "Awaiting" });
      const id = await legacyPurchase({ userId: student._id, catalogId: testDrop(), lines: [line("info-hoodie")] });
      await models.ShopPurchases.collection.updateOne(
        { _id: id },
        { $set: { awaitingStudentReply: true, reviewRevision: 1, reviewHistory: [{ changedBy: officerId, at: new Date(), kind: "follow_up", from: "none", to: "awaiting" }] } },
      );

      const legacy = await getPurchase(models, id);
      assert.equal(legacy.followUpStatus, "contacted");
      assert.deepEqual(legacy.recentHistory.map((h) => [h.from, h.to]), [["none", "contacted"]]);

      const paid = await pay(id, "paid", 1);
      assert.equal(paid.followUpStatus, null);
      assert.deepEqual(paid.recentHistory.at(-1).to, "none");
    });

    it("adds a note to the order's activity without changing follow-up, payment, or stock", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });
      await logFollowUp(id, "will_pay", 0);
      const note = (title, description, expectedRevision) => addNote(models, {
        purchaseId: id, title, note: description, expectedRevision, changedBy: officerId, nowMs: Date.now(),
      });

      const noted = await note("Venmo name changed", "Now pays from @priya-r.", 1);
      const brief = await note("Called", undefined, 2);

      assert.equal(brief.followUpStatus, "will_pay");
      assert.equal(brief.status, "pending");
      assert.equal(brief.reviewRevision, 3);
      assert.deepEqual(noted.recentHistory.at(-1), {
        ...noted.recentHistory.at(-1),
        kind: "note",
        title: "Venmo name changed",
        note: "Now pays from @priya-r.",
        actorName: "Olive Officer",
      });
      assert.equal(brief.recentHistory.at(-1).note, undefined);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 1, units: 1 });
      await assertReviewError(note("Late", undefined, 2), 409, CONFLICT);
      await assertReviewError(addNote(models, { purchaseId: new mongoose.Types.ObjectId(), title: "x", expectedRevision: 0, changedBy: officerId, nowMs: Date.now() }), 404);
    });

    it("shows the saved id when the officer's profile no longer exists", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      const goneOfficer = new mongoose.Types.ObjectId();
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")] });

      const set = await setFollowUp(models, { purchaseId: id, followUpStatus: "contacted", expectedRevision: 0, changedBy: goneOfficer, nowMs: Date.now() });

      assert.equal(set.recentHistory[0].actorName, String(goneOfficer));
    });
  });

  describe("pickup", () => {
    function markPickup(purchaseId, pickedUp, expectedRevision, { actor = officerId, nowMs = Date.now() } = {}) {
      return setPickup(models, { purchaseId, pickedUp, expectedRevision, changedBy: actor, nowMs });
    }

    it("records who picked a paid order up and when, leaving payment, amount, follow-up, and stock as they were", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      await seedCounters({ catalogId, userId: student._id, sku: "info-hoodie", reservedUnits: 1, units: 1 });
      const id = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "paid" });
      const at = Date.parse("2030-03-01T18:05:00Z");

      const picked = await markPickup(id, true, 0, { nowMs: at });

      assert.equal(new Date(picked.pickedUpAt).getTime(), at);
      assert.equal(picked.pickedUpByName, "Olive Officer");
      assert.equal(picked.reviewRevision, 1);
      assert.equal(picked.status, "paid");
      assert.equal(picked.amountReceivedCents, null);
      assert.equal(picked.followUpStatus, null);
      assert.deepEqual(picked.recentHistory.map((h) => [h.kind, h.from, h.to]), [["pickup", "not_picked_up", "picked_up"]]);
      assert.deepEqual(await counts(catalogId, student._id, "info-hoodie"), { reserved: 1, units: 1 });
    });

    it("clears a mark so the order can be handed over again, recording that as its own entry", async () => {
      const student = await buyer();
      const id = await legacyPurchase({ userId: student._id, catalogId: testDrop(), lines: [line("info-hoodie")], status: "paid" });
      const picked = await markPickup(id, true, 0);

      const undone = await markPickup(id, false, picked.reviewRevision);

      assert.equal(undone.pickedUpAt, null);
      assert.equal(undone.pickedUpByName ?? null, null);
      assert.equal(undone.reviewRevision, 2);
      assert.equal(undone.status, "paid");
      assert.deepEqual(undone.recentHistory.map((h) => [h.kind, h.from, h.to]), [
        ["pickup", "not_picked_up", "picked_up"],
        ["pickup", "picked_up", "not_picked_up"],
      ]);
    });

    it("lets exactly one of two officers mark the same order picked up at the same revision", async () => {
      const jordan = await models.Users.create({ uFirstName: "Jordan", uLastName: "Lee", uType: "Admin" });
      const student = await buyer();
      const id = await legacyPurchase({ userId: student._id, catalogId: testDrop(), lines: [line("info-hoodie")], status: "paid" });

      const results = await Promise.allSettled([
        markPickup(id, true, 0, { actor: officerId }),
        markPickup(id, true, 0, { actor: jordan._id }),
      ]);

      const won = results.filter((result) => result.status === "fulfilled");
      const lost = results.filter((result) => result.status === "rejected");
      assert.equal(won.length, 1, "one officer's mark is saved");
      assert.equal(lost.length, 1, "the other is refused as a stale revision");
      assert.ok(lost[0].reason instanceof ShopReviewError);
      assert.equal(lost[0].reason.status, 409);
      assert.match(lost[0].reason.message, CONFLICT);

      const stored = await getPurchase(models, id);
      assert.equal(stored.pickedUpByName, won[0].value.pickedUpByName);
      assert.equal(stored.recentHistory.filter((h) => h.kind === "pickup").length, 1);
    });

    it("refuses to mark an unpaid, dropped, or refunded order picked up, and changes nothing", async () => {
      const student = await buyer();
      for (const status of ["pending", "not_paid", "refunded"]) {
        const id = await legacyPurchase({ userId: student._id, catalogId: testDrop(), lines: [line("info-hoodie")], status });

        await assertReviewError(markPickup(id, true, 0), 409, /^Only paid orders can be picked up\.$/);

        const stored = await getPurchase(models, id);
        assert.equal(stored.status, status);
        assert.equal(stored.reviewRevision, 0);
        assert.equal(stored.pickedUpAt ?? null, null);
      }
    });

    it("refuses a stale revision or a missing order, and marking to the current state changes nothing", async () => {
      const student = await buyer();
      const id = await legacyPurchase({ userId: student._id, catalogId: testDrop(), lines: [line("info-hoodie")], status: "paid" });
      await markPickup(id, true, 0);

      await assertReviewError(markPickup(id, true, 0), 409, CONFLICT);
      await assertReviewError(markPickup(new mongoose.Types.ObjectId(), true, 0), 404);

      const same = await markPickup(id, true, 1);
      assert.equal(same.reviewRevision, 1);
      assert.equal(same.recentHistory.length, 1);
    });
  });

  describe("pickup board", () => {
    it("lists paid orders not yet picked up, oldest first, with the buyer's names, and counts the board", async () => {
      const before = await listReadyForPickup(models, { limit: 1000 });
      const catalogId = testDrop();
      const student = await buyer({ uFirstName: "Board", uLastName: "Alpha", uDisplayName: "Bee" });
      const later = await buyer({ uFirstName: "Board", uLastName: "Omega" });
      const newer = await legacyPurchase({ userId: later._id, catalogId, lines: [line("info-hoodie")], status: "paid", confirmedAt: new Date("2030-03-02T10:00:00Z") });
      const older = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "paid", confirmedAt: new Date("2030-03-01T10:00:00Z") });
      const unpaid = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "pending", confirmedAt: new Date("2030-03-01T09:00:00Z") });
      const pickedUp = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "paid", confirmedAt: new Date("2030-03-01T08:00:00Z") });
      await setPickup(models, { purchaseId: pickedUp, pickedUp: true, expectedRevision: 0, changedBy: officerId, nowMs: Date.now() });

      const board = await listReadyForPickup(models, { limit: 1000 });
      const ids = board.orders.map((order) => String(order._id));
      const mine = ids.filter((id) => [String(older), String(newer), String(unpaid), String(pickedUp)].includes(id));

      assert.deepEqual(mine, [String(older), String(newer)], "only ready orders, oldest first");
      const alpha = board.orders.find((order) => String(order._id) === String(older));
      assert.deepEqual(alpha.buyer, {
        id: String(student._id),
        name: "Bee",
        email: student.uEmail,
        firstName: "Board",
        lastName: "Alpha",
        preferredName: "Bee",
      });
      assert.equal(board.counts.ready - before.counts.ready, 2);
      assert.equal(board.counts.pickedUp - before.counts.pickedUp, 1);
      assert.equal(board.truncated, false);
    });

    it("reports the board as cut short when more orders are ready than the limit, and still counts them all", async () => {
      const catalogId = testDrop();
      const student = await buyer();
      const first = await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "paid", confirmedAt: new Date("2030-04-01T10:00:00Z") });
      await legacyPurchase({ userId: student._id, catalogId, lines: [line("info-hoodie")], status: "paid", confirmedAt: new Date("2030-04-01T11:00:00Z") });
      const beforeCount = (await listReadyForPickup(models, { limit: 1000 })).counts.ready;

      const everything = await listReadyForPickup(models, { limit: 1000 });
      const board = await listReadyForPickup(models, { limit: 1 });

      assert.equal(board.orders.length, 1);
      assert.equal(board.truncated, true);
      assert.equal(String(board.orders[0]._id), String(everything.orders[0]._id), "the cut keeps the oldest orders");
      assert.ok(everything.orders.some((order) => String(order._id) === String(first)));
      assert.equal(board.counts.ready, beforeCount, "counts cover every ready order, not only the listed ones");
    });

    it("keeps an order whose buyer no longer exists, with buyer null", async () => {
      const orphanId = await legacyPurchase({
        userId: new mongoose.Types.ObjectId(),
        catalogId: testDrop(),
        lines: [line("info-hoodie")],
        status: "paid",
        confirmedAt: new Date("2030-05-01T10:00:00Z"),
        venmoUsername: "pickup-orphan",
      });

      const board = await listReadyForPickup(models, { limit: 1000 });
      const orphan = board.orders.find((order) => String(order._id) === String(orphanId));

      assert.ok(orphan, "the order is still on the board");
      assert.equal(orphan.buyer, null);
      assert.equal(orphan.venmoUsername, "pickup-orphan");
    });
  });
});
