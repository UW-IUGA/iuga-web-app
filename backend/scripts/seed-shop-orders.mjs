/*
Purpose: Seed a LOCAL development database with fictional students and Venmo shop purchases, so the
          officer Orders dashboard (/admin/shop/orders) has data to show. --if-empty resumes an
          interrupted run without replacing completed seeded purchases.
Usage:   DB_URI=<local uri> node backend/scripts/seed-shop-orders.mjs [--extra N] [--if-empty]
         --extra N adds N more pending orders (use more than 25 to try "Load more").
          --if-empty skips a complete seed or resumes a partial one, preserving existing seeded
          purchases and their edits. Without it, the script always resets the seeded rows.
         npm start runs it with --if-empty when SEED_SHOP=1 is set in backend/env/.env.dev.
Marks:   Seed users have uNetId "seed-*" and an @example.com email. Seed holds and purchases have
         catalogVersion "seed" and catalogId "seed-fall-2026".
Stock:   Writes only the stock counters for the seed drop ("seed-fall-2026") and for seed buyers. Each
         counter is set from the seeded orders that hold stock (pending and paid), so a seeded order the
         officer drops or refunds stops counting. The checkout drop "fall-2026" is never read or written.
Safety:  Refuses any DB_URI whose host is not loopback.
*/

import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import {
  shopCapacitySchema,
  shopHoldsSchema,
  shopPurchasesSchema,
  shopStudentUnitsSchema,
  usersSchema,
} from "../schemas/schemas.js";
import { HOLDS_STOCK } from "../routes/api/v1/utils/shopPurchaseReview.js";

const SEED_CATALOG_ID = "seed-fall-2026";
// Seeds written before the seed had its own drop id counted their orders on the checkout drop.
const CHECKOUT_CATALOG_ID = "fall-2026";
const CATALOG_VERSION = "seed";
const MAX_COUNTER_SYNC_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXTRA = 500;
const ORDER_DATE_TOLERANCE_MS = 15 * 60 * 1000;

const PRODUCTS = {
  "info-hoodie": { name: "Hoodie", unitPriceCents: 3200, size: "M" },
  "info-crewneck": { name: "Crewneck", unitPriceCents: 3000, size: "L" },
  "info-baseball-tee": { name: "Baseball Tee", unitPriceCents: 2200, size: "S" },
  "info-tote-bag": { name: "Tote Bag", unitPriceCents: 2000, size: "One Size" },
};

// Phone numbers use the 555-01xx range reserved for fiction.
const STUDENTS = [
  { key: "etran", first: "Emily", last: "Tran", venmo: "etran-22", phone: "2065550101" },
  { key: "mreyes", first: "Marcus", last: "Reyes", venmo: "marcus-reyes-7", phone: "2065550102" },
  { key: "praman", first: "Priya", last: "Raman", venmo: "priya.raman", phone: "2065550103" },
  { key: "smensah", first: "Samuel", last: "Mensah", venmo: "sammensah_", phone: "2065550104" },
  { key: "hkim", first: "Hannah", last: "Kim", venmo: "hannah.kim.22", phone: "2065550105" },
];

// daysAgo is relative to the run time, so the dashboard's oldest-first order stays meaningful.
const ORDERS = [
  { student: "mreyes", daysAgo: 12, status: "refunded", lines: [["info-hoodie", 1]] },
  { student: "smensah", daysAgo: 11, status: "not_paid", lines: [["info-tote-bag", 1]] },
  { student: "hkim", daysAgo: 10, status: "paid", lines: [["info-crewneck", 1]] },
  { student: "praman", daysAgo: 10, status: "not_paid", lines: [["info-baseball-tee", 1]] },
  { student: "etran", daysAgo: 9, status: "pending", lines: [["info-hoodie", 1], ["info-tote-bag", 2]] },
  { student: "mreyes", daysAgo: 9, status: "pending", awaitingReply: true, lines: [["info-crewneck", 1]] },
  { student: null, venmo: "tnguyen_01", daysAgo: 8, status: "pending", lines: [["info-hoodie", 1]] },
  { student: "praman", daysAgo: 8, status: "pending", amountReceivedCents: 4000, lines: [["info-hoodie", 2]] },
  { student: "smensah", daysAgo: 7, status: "pending", lines: [["info-baseball-tee", 1]] },
  { student: "hkim", daysAgo: 6, status: "pending", lines: [["info-crewneck", 1]] },
  { student: "etran", daysAgo: 5, status: "pending", lines: [["info-baseball-tee", 1]] },
];

function requireLoopbackUri() {
  const uri = process.env.DB_URI;
  if (!uri) throw new Error("DB_URI is not set. Pass the local MongoDB uri, e.g. DB_URI=mongodb://127.0.0.1:27017/iuga");
  const hosts = uri.replace(/^mongodb(\+srv)?:\/\//, "").split("/")[0].split("@").pop().split(",");
  const isLoopback = hosts.every((host) => /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host));
  if (!isLoopback || uri.startsWith("mongodb+srv://")) {
    throw new Error("Refusing to seed a database that is not on this machine.");
  }
  return uri;
}

function parseExtra(argv) {
  const at = argv.indexOf("--extra");
  if (at === -1) return 0;
  const count = Number(argv[at + 1]);
  if (!Number.isInteger(count) || count < 0 || count > MAX_EXTRA) throw new Error(`--extra needs a whole number from 0 to ${MAX_EXTRA}.`);
  return count;
}

function buildOrders(extra) {
  const generated = Array.from({ length: extra }, (_, i) => ({
    student: STUDENTS[i % STUDENTS.length].key,
    daysAgo: 4 - (i % 4) * 0.5,
    status: "pending",
    lines: [[Object.keys(PRODUCTS)[i % Object.keys(PRODUCTS).length], 1 + (i % 2)]],
  }));
  return [...ORDERS, ...generated];
}

function linesMatch(holdLines, orderLines) {
  return holdLines.length === orderLines.length && orderLines.every(
    (line, index) => holdLines[index].sku === line.sku && holdLines[index].quantity === line.quantity
  );
}

function lineSnapshotsMatch(actualLines, expectedLines) {
  return linesMatch(actualLines, expectedLines) && expectedLines.every((line, index) =>
    actualLines[index].name === line.name &&
    actualLines[index].size === line.size &&
    actualLines[index].unitPriceCents === line.unitPriceCents
  );
}

function ageMatchesOrder(createdAt, confirmedAt, daysAgo) {
  // The stored dates retain the fixture's day offset when buyer and product lines repeat.
  const createdAtMs = new Date(createdAt).getTime();
  const confirmedAtMs = new Date(confirmedAt).getTime();
  return Number.isFinite(createdAtMs) && Number.isFinite(confirmedAtMs) &&
    Math.abs(createdAtMs - confirmedAtMs - daysAgo * DAY_MS) <= ORDER_DATE_TOLERANCE_MS;
}

function holdMatchesOrder(hold, studentUserId, lines, order) {
  const confirmedAt = new Date(hold.expiresAt).getTime() - 15 * 60 * 1000;
  return hold.catalogId === SEED_CATALOG_ID &&
    hold.catalogVersion === CATALOG_VERSION &&
    hold.status === "confirmed" &&
    (!studentUserId || String(hold.userId) === String(studentUserId)) &&
    lineSnapshotsMatch(hold.lines, lines) &&
    ageMatchesOrder(hold.createdAt, confirmedAt, order.daysAgo);
}

function purchaseMatchesOrder(purchase, purchaseData, order) {
  return String(purchase.holdId) === String(purchaseData.holdId) &&
    String(purchase.userId) === String(purchaseData.userId) &&
    purchase.catalogId === purchaseData.catalogId &&
    purchase.catalogVersion === purchaseData.catalogVersion &&
    purchase.venmoUsername === purchaseData.venmoUsername &&
    purchase.totalCents === purchaseData.totalCents &&
    lineSnapshotsMatch(purchase.lines, purchaseData.lines) &&
    ageMatchesOrder(purchase.createdAt, purchase.confirmedAt, order.daysAgo);
}

function stableSeedHoldId(orderIndex) {
  // All --if-empty processes use the same hold identity for a given order position.
  const identity = `iuga-shop-order-seed:${orderIndex}`;
  return new mongoose.Types.ObjectId(createHash("sha256").update(identity).digest("hex").slice(0, 24));
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

async function getOrCreateSeedStudent(Users, student) {
  try {
    const user = await Users.findOneAndUpdate(
      { uNetId: student.uNetId },
      { $setOnInsert: student },
      { upsert: true, new: true }
    ).lean();
    if (user) return user;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
  }

  const existing = await Users.findOne({ uNetId: student.uNetId }).lean();
  if (!existing) throw new Error(`Could not load seeded student ${student.uNetId}.`);
  return existing;
}

async function createOrFindSeedHold(Holds, holdId, holdData) {
  try {
    return await Holds.create({ _id: holdId, ...holdData });
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await Holds.findById(holdId).lean();
    if (existing) return existing;
    throw error;
  }
}

async function createOrFindSeedPurchase(Purchases, purchaseData, order, orderIndex) {
  try {
    return await Purchases.create(purchaseData);
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    const existing = await Purchases.findOne({ holdId: purchaseData.holdId }).lean();
    if (existing && purchaseMatchesOrder(existing, purchaseData, order)) return existing;
    if (existing) {
      throw new Error(`Existing purchase for seeded order ${orderIndex + 1} does not match this seed run.`);
    }
    throw error;
  }
}

// Units each buyer holds for each product, from the orders that hold stock. Orders are counted once each, so
// the result depends only on the orders' current statuses and lines.
export function holdingUnitsByBuyerAndSku(purchases) {
  const rows = new Map();
  for (const purchase of purchases) {
    if (!HOLDS_STOCK.has(purchase.status)) continue;
    for (const line of purchase.lines) {
      const key = `${purchase.userId}/${line.sku}`;
      const row = rows.get(key) ?? { userId: purchase.userId, sku: line.sku, units: 0 };
      row.units += line.quantity;
      rows.set(key, row);
    }
  }
  return [...rows.values()];
}

// Every stock counter the seed drop and its buyers should have, with the value the seeded orders call for.
async function seedStockCounterTargets({ Purchases, Users, Capacity, StudentUnits }) {
  const orders = await Purchases.find({ catalogVersion: CATALOG_VERSION }).select("userId status lines").lean();
  const holding = holdingUnitsByBuyerAndSku(orders);
  const buyers = new Map();
  for (const order of orders) buyers.set(String(order.userId), order.userId);
  for (const user of await Users.find({ uNetId: /^seed-/ }).select("_id").lean()) {
    buyers.set(String(user._id), user._id);
  }

  const targets = [];
  for (const sku of Object.keys(PRODUCTS)) {
    const reservedUnits = holding
      .filter((row) => row.sku === sku)
      .reduce((sum, row) => sum + row.units, 0);
    targets.push({ Model: Capacity, filter: { catalogId: SEED_CATALOG_ID, sku }, field: "reservedUnits", value: reservedUnits });
    for (const [buyerKey, userId] of buyers) {
      const units = holding.find((row) => String(row.userId) === buyerKey && row.sku === sku)?.units ?? 0;
      targets.push({ Model: StudentUnits, filter: { userId, sku }, field: "units", value: units });
    }
  }
  return targets;
}

async function setStockCounter({ Model, filter, field, value }) {
  const write = () => Model.updateOne(filter, { $set: { [field]: value } }, { upsert: true });
  try {
    await write();
  } catch (error) {
    // Two runs can create the same counter at once; the second write then updates it.
    if (!isDuplicateKeyError(error)) throw error;
    await write();
  }
}

async function stockCountersMatch(targets) {
  for (const { Model, filter, field, value } of targets) {
    const stored = await Model.findOne(filter).lean();
    if (stored?.[field] !== value) return false;
  }
  return true;
}

// Counters are set to absolute values, never incremented, so a repeated or interrupted run cannot double-count.
// A concurrent run can change the orders while this one writes, so the orders are read again afterward and the
// counters are rewritten until they match.
async function syncSeedStockCounters(models) {
  for (let attempt = 1; attempt <= MAX_COUNTER_SYNC_ATTEMPTS; attempt += 1) {
    for (const target of await seedStockCounterTargets(models)) {
      await setStockCounter(target);
    }
    if (await stockCountersMatch(await seedStockCounterTargets(models))) return;
  }
  throw new Error("Seed stock counters kept changing during this run. Run the seed again.");
}

// Seeded orders from before the seed had its own drop id were counted on the checkout drop. Moving them off
// it means retaking one of them cannot change the checkout counters.
async function moveSeedOrdersOffCheckoutDrop(Purchases, Holds) {
  const filter = { catalogVersion: CATALOG_VERSION, catalogId: CHECKOUT_CATALOG_ID };
  const update = { $set: { catalogId: SEED_CATALOG_ID } };
  await Purchases.updateMany(filter, update);
  await Holds.updateMany(filter, update);
}

async function main() {
  const uri = requireLoopbackUri();
  const extra = parseExtra(process.argv.slice(2));
  const ifEmpty = process.argv.includes("--if-empty");
  await mongoose.connect(uri);
  const Users = mongoose.model("Users", usersSchema);
  const Holds = mongoose.model("ShopHolds", shopHoldsSchema);
  const Purchases = mongoose.model("ShopPurchases", shopPurchasesSchema);
  const Capacity = mongoose.model("ShopCapacity", shopCapacitySchema);
  const StudentUnits = mongoose.model("ShopStudentUnits", shopStudentUnitsSchema);
  const stockModels = { Purchases, Users, Capacity, StudentUnits };

  try {
    // Concurrent seed writers rely on the schema-declared unique indexes.
    await Promise.all([Users.init(), Holds.init(), Purchases.init(), Capacity.init(), StudentUnits.init()]);
    const orders = buildOrders(extra);
    let existingPurchases = [];
    let unpairedHolds = [];
    let stableHoldIds = new Set();
    if (ifEmpty) {
      await moveSeedOrdersOffCheckoutDrop(Purchases, Holds);
      existingPurchases = await Purchases.find({ catalogVersion: CATALOG_VERSION }).select("_id holdId").lean();
      for (const purchase of existingPurchases) {
        await Holds.updateOne(
          {
            _id: purchase.holdId,
            catalogVersion: CATALOG_VERSION,
            $or: [{ purchaseId: null }, { purchaseId: { $exists: false } }],
          },
          { $set: { purchaseId: purchase._id } }
        );
      }
      if (existingPurchases.length >= orders.length) {
        await syncSeedStockCounters(stockModels);
        console.log(`[seed] seeded orders already exist in ${mongoose.connection.name}; skipping. Run npm run seed:shop to reset them.`);
        return;
      }

      stableHoldIds = new Set(Array.from(
        { length: ORDERS.length + MAX_EXTRA },
        (_, index) => String(stableSeedHoldId(index))
      ));
      const linkedHoldIds = new Set(existingPurchases.map((purchase) => String(purchase.holdId)));
      unpairedHolds = (await Holds.find({
        catalogVersion: CATALOG_VERSION,
        catalogId: SEED_CATALOG_ID,
        status: "confirmed",
        purchaseId: null,
      }).lean()).filter((hold) => !linkedHoldIds.has(String(hold._id)));
    }

    if (!ifEmpty) {
      const old = await Users.find({ uNetId: /^seed-/ }).select("_id").lean();
      const oldBuyerIds = [
        ...old.map((u) => u._id),
        ...(await Purchases.distinct("userId", { catalogVersion: CATALOG_VERSION })),
      ];
      await Purchases.deleteMany({ catalogVersion: CATALOG_VERSION });
      await Holds.deleteMany({ catalogVersion: CATALOG_VERSION });
      await Users.deleteMany({ _id: { $in: old.map((u) => u._id) } });
      await Capacity.deleteMany({ catalogId: SEED_CATALOG_ID });
      await StudentUnits.deleteMany({ userId: { $in: oldBuyerIds } });
    }

    const studentDocuments = STUDENTS.map((s) => ({
      uFirstName: s.first,
      uLastName: s.last,
      uDisplayName: `${s.first} ${s.last}`,
      uEmail: `${s.key}@example.com`,
      uNetId: `seed-${s.key}`,
      uVenmoUsername: s.venmo,
      uPhoneNumber: s.phone,
    }));
    const users = ifEmpty
      ? await Promise.all(
          studentDocuments.map((student) => getOrCreateSeedStudent(Users, student))
        )
      : await Users.insertMany(studentDocuments);
    const userByKey = new Map(STUDENTS.map((s, i) => [s.key, users[i]]));
    const venmoByKey = new Map(STUDENTS.map((s) => [s.key, s.venmo]));

    const now = Date.now();
    for (const [index, order] of orders.entries()) {
      if (ifEmpty && index < existingPurchases.length) continue;
      const lines = order.lines.map(([sku, quantity]) => ({ sku, quantity, ...PRODUCTS[sku] }));
      const confirmedAt = new Date(now - order.daysAgo * DAY_MS);
      // A buyer with no user record shows how the dashboard handles a deleted account.
      const studentUserId = order.student ? userByKey.get(order.student)._id : null;
      const stableHoldId = ifEmpty ? stableSeedHoldId(index) : null;
      const stableHold = stableHoldId
        ? unpairedHolds.find((hold) => String(hold._id) === String(stableHoldId)) ?? null
        : null;
      const matchingHolds = ifEmpty ? unpairedHolds.filter((hold) =>
        !stableHoldIds.has(String(hold._id)) && holdMatchesOrder(hold, studentUserId, lines, order)
      ) : [];
      if (matchingHolds.length > 1) {
        throw new Error("Multiple unpaired seed holds match the next order; refusing to create a duplicate.");
      }
      if (stableHold && matchingHolds.length > 0) {
        throw new Error(`Multiple unpaired seed holds match seeded order ${index + 1}; refusing to choose one.`);
      }
      const hold = stableHold ?? matchingHolds[0] ?? null;
      if (hold) unpairedHolds.splice(unpairedHolds.indexOf(hold), 1);
      const holdData = {
        userId: studentUserId ?? hold?.userId ?? new mongoose.Types.ObjectId(),
        catalogId: SEED_CATALOG_ID, catalogVersion: CATALOG_VERSION, lines,
        status: "confirmed", expiresAt: new Date(confirmedAt.getTime() + 15 * 60 * 1000),
      };
      const savedHold = hold ?? (ifEmpty
        ? await createOrFindSeedHold(Holds, stableHoldId, holdData)
        : await Holds.create(holdData));
      if (!holdMatchesOrder(savedHold, studentUserId, lines, order)) {
        throw new Error(`Existing hold for seeded order ${index + 1} does not match this seed run.`);
      }
      const userId = savedHold.userId;
      const purchaseData = {
        holdId: savedHold._id, userId, catalogId: SEED_CATALOG_ID, catalogVersion: CATALOG_VERSION,
        venmoUsername: order.venmo ?? venmoByKey.get(order.student),
        lines,
        totalCents: lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0),
        status: order.status, confirmedAt,
        awaitingStudentReply: order.awaitingReply === true,
        amountReceivedCents: order.amountReceivedCents ?? null,
      };
      const purchase = ifEmpty
        ? await createOrFindSeedPurchase(Purchases, purchaseData, order, index)
        : await Purchases.create(purchaseData);
      await Holds.updateOne(
        {
          _id: savedHold._id,
          catalogVersion: CATALOG_VERSION,
          $or: [{ purchaseId: null }, { purchaseId: purchase._id }],
        },
        { $set: { purchaseId: purchase._id } }
      );
    }
    await syncSeedStockCounters(stockModels);
    console.log(`[seed] ${users.length} students and ${orders.length} purchases written to ${mongoose.connection.name}.`);
  } finally {
    await mongoose.disconnect();
  }
}

// Importing this file for its helpers must not run the seed.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`[seed] ${error.message}`);
    process.exit(1);
  });
}
