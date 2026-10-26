import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import { holdingUnitsByBuyerAndSku } from "../scripts/seed-shop-orders.mjs";

const seedScript = fileURLToPath(new URL("../scripts/seed-shop-orders.mjs", import.meta.url));

// Every case fails before the script opens a database connection, so no MongoDB is needed.
function runSeed({ dbUri, args = [] }) {
  const env = { PATH: process.env.PATH };
  if (dbUri !== undefined) env.DB_URI = dbUri;
  return spawnSync(process.execPath, [seedScript, ...args], { encoding: "utf8", env });
}

it("refuses to run without DB_URI", () => {
  const result = runSeed({});
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DB_URI is not set/);
});

it("refuses a database host that is not on this machine", () => {
  const result = runSeed({ dbUri: "mongodb://db.example.com:27017/iuga" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to seed a database that is not on this machine/);
});

it("refuses an Atlas-style mongodb+srv URI even when its host name looks local", () => {
  const result = runSeed({ dbUri: "mongodb+srv://127.0.0.1/iuga" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to seed a database that is not on this machine/);
});

it("refuses a replica-set URI when any listed host is remote", () => {
  const result = runSeed({ dbUri: "mongodb://127.0.0.1:50356,db.example.com:27017/iuga?replicaSet=rs0" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing to seed a database that is not on this machine/);
});

it("rejects an --extra count above 500", () => {
  const result = runSeed({ dbUri: "mongodb://127.0.0.1:50356/iuga?replicaSet=rs0&directConnection=true", args: ["--extra", "501"] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--extra needs a whole number from 0 to 500/);
});

// The seed's stock counters must equal what its holding orders use, so the test checks that sum directly.
const orderFor = (userId, status, lines) => ({
  userId,
  status,
  lines: lines.map(([sku, quantity]) => ({ sku, quantity })),
});
const unitsByBuyerAndSku = (rows) =>
  Object.fromEntries(rows.map((row) => [`${row.userId}/${row.sku}`, row.units]));

it("counts only the units of orders that hold stock", () => {
  const buyer = "64b000000000000000000001";
  const rows = holdingUnitsByBuyerAndSku([
    orderFor(buyer, "pending", [["info-hoodie", 2]]),
    orderFor(buyer, "paid", [["info-tote-bag", 1]]),
    orderFor(buyer, "not_paid", [["info-hoodie", 5]]),
    orderFor(buyer, "refunded", [["info-hoodie", 3]]),
  ]);
  assert.deepEqual(unitsByBuyerAndSku(rows), {
    [`${buyer}/info-hoodie`]: 2,
    [`${buyer}/info-tote-bag`]: 1,
  });
});

it("adds up one buyer's units across orders and lines, and keeps buyers apart", () => {
  const first = "64b000000000000000000001";
  const second = "64b000000000000000000002";
  const rows = holdingUnitsByBuyerAndSku([
    orderFor(first, "pending", [["info-hoodie", 1], ["info-tote-bag", 2]]),
    orderFor(first, "paid", [["info-hoodie", 2]]),
    orderFor(second, "pending", [["info-hoodie", 1]]),
  ]);
  assert.deepEqual(unitsByBuyerAndSku(rows), {
    [`${first}/info-hoodie`]: 3,
    [`${first}/info-tote-bag`]: 2,
    [`${second}/info-hoodie`]: 1,
  });
});
