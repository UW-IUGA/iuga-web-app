/*
Purpose: Smoke-test manual Venmo shop checkout end to end. The suite starts the real backend as a child
         process against a MongoDB replica set, signs in test students through the Graph stub, drives the
         /api/v1/shop/holds routes over HTTP, and reads MongoDB directly after every action.
Run with: cd backend && SHOP_REPLSET_URI='<value printed by scripts/start-replica-set-mongodb.sh>' node --test test/shopCheckout.smoke.test.js
Skipped unless SHOP_REPLSET_URI is set, because holds use transactions, which need a replica set.
*/

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import {
  shopCapacitySchema,
  shopHoldsSchema,
  shopProductLimitsSchema,
  shopPurchasesSchema,
  shopStudentUnitsSchema,
  shopStudentCheckoutsSchema,
  usersSchema,
} from "../schemas/schemas.js";

const uri = process.env.SHOP_REPLSET_URI;
const run = uri ? describe : describe.skip;

const BACKEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STUB_PATH = path.join(BACKEND_DIR, "test", "shopSmokeGraphStub.js");
const LISTENING_PATTERN = /\[startup\] Listening at [^\s:]+:(\d+)/;
const SESSION_SECRET = "shop-smoke-session-secret";
const SUITE_CLIENT_IP = "10.77.255.1";
const REQUEST_TIMEOUT_MS = 15_000;
const STARTUP_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;
const INDEX_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 100;
const MINUTE_MS = 60_000;
const MONGO_NAMESPACE_NOT_FOUND = 26;

const CATALOG_PATH = "/api/v1/shop/catalog";
const LOGIN_PATH = "/api/v1/user/login";
const USER_PATH = "/api/v1/user";
const HOLDS_PATH = "/api/v1/shop/holds";
const CLOSED_MESSAGE =
  "Online checkout is temporarily unavailable. Your cart has not changed; please check back later.";
const EXPIRED_MESSAGE = "This hold has expired. Its items have been released.";

const SHOP_MODEL_NAMES = ["ShopHolds", "ShopPurchases", "ShopCapacity", "ShopStudentUnits", "ShopStudentCheckouts", "ShopProductLimits"];
const REQUIRED_UNIQUE_INDEXES = [
  { model: "ShopCapacity", key: { catalogVersion: 1, sku: 1 } },
  { model: "ShopStudentUnits", key: { userId: 1, sku: 1 } },
  { model: "ShopProductLimits", key: { sku: 1 } },
  { model: "ShopPurchases", key: { holdId: 1 } },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * @behavior Poll check until it reports done, sleeping between polls. A check may throw to fail at once.
 * @param description — what is awaited, named in the timeout message
 * @param check — returns { done, value, detail }; detail says why the condition is still false
 * @param timeoutMs — deadline counted from the first check
 * @returns the value reported with done
 */
async function waitFor(description, check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result.done) {
      return result.value;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs} ms waiting for ${description}: ${result.detail}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function exitState(child) {
  return hasExited(child) ? { done: true } : { done: false, detail: "the process is still running" };
}

function lastLines(server, count = 40) {
  return server.output.split("\n").slice(-count).join("\n");
}

function parseBody(text) {
  if (text === "") {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    // Non-JSON bodies, such as Express's HTML 404 page, stay as text so a failing assertion still shows them.
    return text;
  }
}

/*
 * @behavior Send one request to a running backend. Every request carries the server's Origin unless origin is
 *           null, because the CSRF check rejects signed-in writes that lack a trusted Origin.
 * @param server — running backend from startServer
 * @param options.student — supplies the default session cookie and X-Forwarded-For address
 * @param options.cookie — replaces the session cookie; null sends none
 * @param options.origin — replaces the Origin header; null omits it
 * @param options.auth — Authorization header value
 * @param options.body — JSON request body
 * @returns { status, body, setCookies }
 */
async function send(server, method, pathname, options = {}) {
  const { student, origin = server.origin, auth, body, forwardedFor } = options;
  const cookie = options.cookie !== undefined ? options.cookie : student?.cookie;

  const headers = { "x-forwarded-for": forwardedFor ?? student?.forwardedFor ?? SUITE_CLIENT_IP };
  if (origin) {
    headers.origin = origin;
  }
  if (cookie) {
    headers.cookie = cookie;
  }
  if (auth) {
    headers.authorization = auth;
  }
  if (body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const response = await fetch(`${server.origin}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  const result = {
    status: response.status,
    body: parseBody(text),
    setCookies: response.headers.getSetCookie(),
  };
  if (result.status === 500) {
    console.error(`HTTP 500 from ${method} ${pathname}. Last 40 lines of backend output:\n${lastLines(server)}`);
  }
  return result;
}

function sessionCookieOf(response) {
  const setCookie = response.setCookies.find((value) => value.startsWith("connect.sid="));
  assert.ok(setCookie, `login did not set connect.sid; Set-Cookie was ${JSON.stringify(response.setCookies)}`);
  return setCookie.split(";")[0];
}

/*
 * @behavior Assert the HTTP status and, when given, the error message. A failure shows the whole body.
 */
function expectResponse(response, status, message) {
  const received = `HTTP ${response.status} ${JSON.stringify(response.body)}`;
  assert.equal(response.status, status, `expected HTTP ${status}, received ${received}`);
  if (message !== undefined) {
    assert.equal(response.body?.message, message, `expected message "${message}", received ${received}`);
  }
}

/*
 * @behavior Assert a successful hold response and return the hold.
 */
function expectHold(response) {
  expectResponse(response, 200);
  assert.equal(response.body.status, "success", `expected a success body, received ${JSON.stringify(response.body)}`);
  return response.body.hold;
}

/*
 * @behavior Assert a successful confirm response and return the purchase.
 */
function expectPurchase(response) {
  expectResponse(response, 200);
  assert.equal(response.body.status, "success", `expected a success body, received ${JSON.stringify(response.body)}`);
  return response.body.purchase;
}

function studentSkuKey(userId, sku) {
  return `${String(userId)}|${sku}`;
}

function item(sku, size, quantity = 1) {
  return { sku, size, quantity };
}

function lineFields(lines) {
  return lines.map(({ sku, name, size, quantity, unitPriceCents }) => ({ sku, name, size, quantity, unitPriceCents }));
}

run("shop manual Venmo checkout against the real backend", () => {
  let connection;
  let models;
  let dbName;
  let catalogVersion;
  let primary;
  let seededUnits = new Map();
  let studentCount = 0;
  const runTag = Date.now().toString(36);
  const liveServers = new Set();

  before(async () => {
    dbName = `shop_smoke_${Date.now()}`;
    connection = await mongoose
      .createConnection(uri, { dbName, autoIndex: false, autoCreate: false })
      .asPromise();
    models = {
      ShopHolds: connection.model("ShopHolds", shopHoldsSchema),
      ShopPurchases: connection.model("ShopPurchases", shopPurchasesSchema),
      ShopCapacity: connection.model("ShopCapacity", shopCapacitySchema),
      ShopStudentUnits: connection.model("ShopStudentUnits", shopStudentUnitsSchema),
      ShopStudentCheckouts: connection.model("ShopStudentCheckouts", shopStudentCheckoutsSchema),
      ShopProductLimits: connection.model("ShopProductLimits", shopProductLimitsSchema),
      Users: connection.model("Users", usersSchema),
    };

    primary = await startServer({ manualCheckoutExposed: true });
    const catalogResponse = await send(primary, "GET", CATALOG_PATH);
    expectResponse(catalogResponse, 200);
    const { catalog } = catalogResponse.body;
    if (catalog.saleState !== "open") {
      throw new Error(
        `The shop sale is "${catalog.saleState}", not "open". The suite needs an open sale window ` +
          `(opensAt ${catalog.opensAt}, closesAt ${catalog.closesAt}).`,
      );
    }
    catalogVersion = catalog.catalogVersion;
  });

  after(async () => {
    const stops = await Promise.allSettled([...liveServers].map((server) => stopServer(server)));
    try {
      if (connection) {
        await connection.dropDatabase();
      }
    } finally {
      await connection?.close();
    }
    const failedStop = stops.find((stop) => stop.status === "rejected");
    if (failedStop) {
      throw failedStop.reason;
    }
  });

  beforeEach(async () => {
    seededUnits = new Map();
    await Promise.all(SHOP_MODEL_NAMES.map((name) => models[name].deleteMany({})));
  });

  /*
   * @behavior Start the real backend and wait until it prints its Listening line and answers /readyz.
   * @param options.manualCheckoutExposed — true sets SHOP_MANUAL_CHECKOUT_EXPOSED=true in the child
   * @returns the running server, with origin http://localhost:<port>
   * @throws when the child exits or misses the startup deadline. Prints the last 40 output lines first.
   */
  async function startServer({ manualCheckoutExposed }) {
    const child = spawn(process.execPath, ["--import", STUB_PATH, "./bin/www.cjs"], {
      cwd: BACKEND_DIR,
      env: childEnvironment(manualCheckoutExposed),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const server = { child, origin: null, output: "" };
    child.stdout.on("data", (chunk) => {
      server.output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      server.output += chunk;
    });
    liveServers.add(server);

    try {
      const port = await waitFor(
        "the backend to print its Listening line",
        () => {
          const match = LISTENING_PATTERN.exec(server.output);
          if (match) {
            return { done: true, value: Number(match[1]) };
          }
          if (hasExited(child)) {
            throw new Error(`the backend exited with code ${child.exitCode} before it listened`);
          }
          return { done: false, detail: "no Listening line yet" };
        },
        STARTUP_TIMEOUT_MS,
      );
      server.origin = `http://localhost:${port}`;
      const ready = await send(server, "GET", "/readyz", { origin: null });
      assert.equal(ready.status, 200, `/readyz returned HTTP ${ready.status}`);
      assert.deepEqual(ready.body, { status: "ok" });
    } catch (error) {
      console.error(`The backend did not start. Last 40 lines of its output:\n${lastLines(server)}`);
      await stopServer(server);
      throw error;
    }
    return server;
  }

  /*
   * @behavior Stop a child backend with SIGTERM, escalating to SIGKILL when it has not exited in time.
   * @throws when the process still runs after SIGKILL
   */
  async function stopServer(server) {
    const { child } = server;
    if (!hasExited(child)) {
      child.kill("SIGTERM");
      try {
        await waitFor("the backend to exit after SIGTERM", () => exitState(child), STOP_TIMEOUT_MS);
      } catch {
        child.kill("SIGKILL");
        await waitFor("the backend to exit after SIGKILL", () => exitState(child), STOP_TIMEOUT_MS);
      }
    }
    liveServers.delete(server);
  }

  /*
   * @behavior Build the child's environment from an allow-list. The parent's other variables, including
   *           STRIPE_SECRET_KEY and DEPLOY_ENV, never reach the backend.
   */
  function childEnvironment(manualCheckoutExposed) {
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DB_URI: databaseUriForRun(),
      SESSION_SECRET,
      IUGA_LOCAL_DEV: "1",
      IUGA_SHOP_SMOKE: "1",
      // Limit changes made by the test must reach the running server at once, so the cache is off here.
      SHOP_LIMIT_CACHE_SECONDS: "0",
    };
    if (manualCheckoutExposed) {
      env.SHOP_MANUAL_CHECKOUT_EXPOSED = "true";
    }
    return env;
  }

  // The backend connects to the database named in its URI path, so this run's database goes there.
  function databaseUriForRun() {
    const url = new URL(uri);
    url.pathname = `/${dbName}`;
    return url.toString();
  }

  /*
   * @behavior Create a test student with a new slug, so no scenario shares a user, a hold, or a rate-limit bucket.
   *           The token is accepted only by the Graph stub. The forwarded address keeps rate limits per student.
   */
  function newStudent() {
    studentCount += 1;
    const slug = `s${runTag}${studentCount}`;
    return {
      slug,
      token: `smoke:${slug}`,
      email: `${slug}@smoke.test`,
      forwardedFor: `10.77.${Math.floor(studentCount / 250)}.${(studentCount % 250) + 1}`,
      cookie: null,
      userId: null,
    };
  }

  function login(server, student, token = student.token) {
    return send(server, "POST", LOGIN_PATH, { student, cookie: null, auth: `Bearer ${token}` });
  }

  async function signIn(server = primary) {
    const student = newStudent();
    const response = await login(server, student);
    expectResponse(response, 200);
    student.cookie = sessionCookieOf(response);
    student.userId = response.body._id;
    return student;
  }

  function requestHold(student, items) {
    return send(primary, "POST", HOLDS_PATH, { student, body: { catalogVersion, items } });
  }

  function requestGetHold(student, holdId) {
    return send(primary, "GET", `${HOLDS_PATH}/${holdId}`, { student });
  }

  function requestRemoveLine(student, holdId, sku, size) {
    return send(primary, "PATCH", `${HOLDS_PATH}/${holdId}/lines`, { student, body: { sku, size } });
  }

  function requestCancel(student, holdId) {
    return send(primary, "DELETE", `${HOLDS_PATH}/${holdId}`, { student });
  }

  function requestConfirm(student, holdId, venmoUsername) {
    return send(primary, "POST", `${HOLDS_PATH}/${holdId}/confirm`, { student, body: { venmoUsername, phoneNumber: "2065550123" } });
  }

  /*
   * @behavior Write a stock counter for this run and remember the amount, so the ledger check can account for it.
   */
  async function seedCapacity(sku, reservedUnits) {
    await models.ShopCapacity.create({ catalogVersion, sku, reservedUnits });
    seededUnits.set(sku, reservedUnits);
  }

  async function seedPerStudentLimit(sku, perStudentLimit) {
    await models.ShopProductLimits.create({ sku, perStudentLimit });
  }

  async function reservedUnits(sku) {
    const doc = await models.ShopCapacity.findOne({ catalogVersion, sku }).lean();
    return doc?.reservedUnits ?? 0;
  }

  async function unitsFor(student, sku) {
    const doc = await models.ShopStudentUnits.findOne({ userId: student.userId, sku }).lean();
    return doc?.units ?? 0;
  }

  async function holdDocument(holdId) {
    return models.ShopHolds.findById(holdId).lean();
  }

  // Moves a hold's deadline into the past without touching its status, so the next request sees it expire.
  async function backdateHold(holdId) {
    await models.ShopHolds.updateOne({ _id: holdId }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  }

  // Snapshots every shop collection, so a refused request can be shown to change nothing.
  async function readShopState() {
    const [holds, purchases, capacity, unitsByStudent, limits] = await Promise.all([
      models.ShopHolds.find({}).sort({ _id: 1 }).lean(),
      models.ShopPurchases.find({}).sort({ _id: 1 }).lean(),
      models.ShopCapacity.find({}).sort({ _id: 1 }).lean(),
      models.ShopStudentUnits.find({}).sort({ _id: 1 }).lean(),
      models.ShopProductLimits.find({}).sort({ _id: 1 }).lean(),
    ]);
    return { holds, purchases, capacity, unitsByStudent, limits };
  }

  // The app builds indexes in the background after it connects. A missing collection has no indexes yet.
  async function listIndexes(modelName) {
    try {
      return await models[modelName].collection.indexes();
    } catch (error) {
      if (error?.code === MONGO_NAMESPACE_NOT_FOUND) {
        return [];
      }
      throw error;
    }
  }

  async function missingUniqueIndexes() {
    const missing = [];
    for (const { model, key } of REQUIRED_UNIQUE_INDEXES) {
      const indexes = await listIndexes(model);
      const built = indexes.some(
        (index) => index.unique === true && JSON.stringify(index.key) === JSON.stringify(key),
      );
      if (!built) {
        missing.push(`${model} ${JSON.stringify(key)}`);
      }
    }
    return missing;
  }

  /*
   * @behavior Check the stock and per-student counters against the holds that still count (active or confirmed).
   *           Each stock counter must equal its seeded amount plus the counting lines for that sku, and each
   *           student's units must equal that student's counting lines for that sku. No counter may be negative.
   * @throws AssertionError on the first counter that disagrees
   */
  async function assertLedgerBalanced() {
    const [capacity, unitsByStudent, countingHolds] = await Promise.all([
      models.ShopCapacity.find({}).lean(),
      models.ShopStudentUnits.find({}).lean(),
      models.ShopHolds.find({ status: { $in: ["active", "confirmed"] } }).lean(),
    ]);

    for (const doc of capacity) {
      assert.ok(doc.reservedUnits >= 0, `ledger: reservedUnits for ${doc.sku} is ${doc.reservedUnits}`);
    }
    for (const doc of unitsByStudent) {
      assert.ok(doc.units >= 0, `ledger: units for ${doc.sku} on ${doc.userId} is ${doc.units}`);
    }

    const expectedStock = new Map(seededUnits);
    const expectedByStudent = new Map();
    for (const hold of countingHolds) {
      for (const line of hold.lines) {
        expectedStock.set(line.sku, (expectedStock.get(line.sku) ?? 0) + line.quantity);
        const key = studentSkuKey(hold.userId, line.sku);
        expectedByStudent.set(key, (expectedByStudent.get(key) ?? 0) + line.quantity);
      }
    }

    const stockBySku = new Map(capacity.map((doc) => [doc.sku, doc.reservedUnits]));
    for (const sku of new Set([...expectedStock.keys(), ...stockBySku.keys()])) {
      const stock = stockBySku.get(sku) ?? 0;
      const expected = expectedStock.get(sku) ?? 0;
      assert.equal(
        stock,
        expected,
        `ledger: reservedUnits for ${sku} is ${stock}, but seeds and counting holds imply ${expected}`,
      );
    }

    const unitsByKey = new Map(unitsByStudent.map((doc) => [studentSkuKey(doc.userId, doc.sku), doc.units]));
    for (const key of new Set([...expectedByStudent.keys(), ...unitsByKey.keys()])) {
      const units = unitsByKey.get(key) ?? 0;
      const expected = expectedByStudent.get(key) ?? 0;
      assert.equal(units, expected, `ledger: units for ${key} is ${units}, but counting holds imply ${expected}`);
    }
  }

  it("scenario 0: the database is a replica set with the unique indexes the holds depend on", async () => {
    const hello = await connection.db.admin().command({ hello: 1 });
    assert.ok(
      typeof hello.setName === "string" && hello.setName !== "",
      `expected the server to report a replica set name, got ${JSON.stringify(hello)}`,
    );

    await waitFor(
      "the unique indexes the holds depend on",
      async () => {
        const missing = await missingUniqueIndexes();
        return missing.length === 0 ? { done: true } : { done: false, detail: `still missing ${missing.join(", ")}` };
      },
      INDEX_TIMEOUT_MS,
    );
    await assertLedgerBalanced();
  });

  it("scenario 1: sign-in issues one user and a session that gates the user and hold routes", async () => {
    const student = newStudent();

    const first = await login(primary, student);
    expectResponse(first, 200);
    const second = await login(primary, student);
    expectResponse(second, 200);
    assert.equal(second.body._id, first.body._id, "a second login with the same token must resolve to the same user");
    assert.equal(await models.Users.countDocuments({ uEmail: student.email }), 1);

    student.cookie = sessionCookieOf(second);
    student.userId = second.body._id;
    const profile = await send(primary, "GET", USER_PATH, { student });
    expectResponse(profile, 200);
    assert.deepEqual(profile.body, {
      firstName: student.slug,
      lastName: "Smoke",
      displayName: `Smoke ${student.slug}`,
      email: student.email,
      memberType: "Member",
    });

    expectResponse(await send(primary, "GET", USER_PATH, { student, cookie: null }), 401, "Not authenticated");
    expectResponse(
      await send(primary, "POST", HOLDS_PATH, {
        student,
        cookie: null,
        body: { catalogVersion, items: [item("info-hoodie", "M")] },
      }),
      401,
      "Not authenticated",
    );
    expectResponse(await login(primary, student, "not-a-smoke-token"), 401);
    await assertLedgerBalanced();
  });

  it("scenario 2: a hold on two products is confirmed into one pending purchase", async () => {
    const student = await signIn();
    const hold = expectHold(await requestHold(student, [item("info-hoodie", "M"), item("info-tote-bag", "One Size")]));
    assert.equal(hold.status, "active");
    assert.equal(hold.lines.length, 2);
    assert.equal(hold.totalCents, 5200);
    const minutesLeft = (Date.parse(hold.expiresAt) - Date.now()) / MINUTE_MS;
    assert.ok(
      minutesLeft >= 14 && minutesLeft <= 16,
      `expiresAt is ${minutesLeft.toFixed(2)} minutes away, expected 14 to 16`,
    );

    assert.equal(await models.ShopHolds.countDocuments({}), 1);
    assert.equal((await holdDocument(hold.id)).status, "active");
    assert.equal(await reservedUnits("info-hoodie"), 1);
    assert.equal(await reservedUnits("info-tote-bag"), 1);
    assert.equal(await unitsFor(student, "info-hoodie"), 1);
    assert.equal(await unitsFor(student, "info-tote-bag"), 1);
    assert.equal(await models.ShopPurchases.countDocuments({}), 0);

    const fetched = expectHold(await requestGetHold(student, hold.id));
    assert.deepEqual(fetched, hold);

    const purchase = expectPurchase(await requestConfirm(student, hold.id, "@Jane.Doe"));
    assert.equal(purchase.status, "pending");
    assert.equal(purchase.venmoUsername, "jane.doe");
    assert.equal(purchase.totalCents, 5200);

    const confirmedHold = await holdDocument(hold.id);
    assert.equal(confirmedHold.status, "confirmed");
    assert.equal(String(confirmedHold.purchaseId), purchase.id);
    const purchases = await models.ShopPurchases.find({}).lean();
    assert.equal(purchases.length, 1);
    assert.equal(String(purchases[0].holdId), hold.id);
    assert.deepEqual(lineFields(purchases[0].lines), lineFields(confirmedHold.lines));
    assert.equal((await models.Users.findById(student.userId).select("+uVenmoUsername").lean()).uVenmoUsername, "jane.doe");

    assert.equal(await reservedUnits("info-hoodie"), 1);
    assert.equal(await reservedUnits("info-tote-bag"), 1);
    assert.equal(await unitsFor(student, "info-hoodie"), 1);
    assert.equal(await unitsFor(student, "info-tote-bag"), 1);
    await assertLedgerBalanced();
  });

  it("scenario 3: the per-student limit applies per product, and a refused cart holds nothing", async () => {
    await seedPerStudentLimit("info-hoodie", 1);
    const holder = await signIn();
    const bought = expectHold(await requestHold(holder, [item("info-hoodie", "M")]));
    expectPurchase(await requestConfirm(holder, bought.id, "jane.doe"));

    expectResponse(await requestHold(holder, [item("info-hoodie", "L")]), 409, "Hoodie is limited to 1 per student.");
    assert.equal(await unitsFor(holder, "info-hoodie"), 1);
    assert.equal(await reservedUnits("info-hoodie"), 1);
    assert.equal(await models.ShopHolds.countDocuments({ userId: holder.userId }), 1);

    const greedy = await signIn();
    expectResponse(
      await requestHold(greedy, [item("info-hoodie", "M", 2)]),
      409,
      "Hoodie is limited to 1 per student.",
    );
    assert.equal(await unitsFor(greedy, "info-hoodie"), 0);
    assert.equal(await reservedUnits("info-hoodie"), 1);

    expectResponse(
      await requestHold(holder, [item("info-crewneck", "M"), item("info-hoodie", "L")]),
      409,
      "Hoodie is limited to 1 per student.",
    );
    assert.equal(await reservedUnits("info-crewneck"), 0);
    assert.equal(await unitsFor(holder, "info-crewneck"), 0);
    assert.equal(
      await models.ShopHolds.countDocuments({ userId: holder.userId }),
      1,
      "a refused cart must not create a hold",
    );

    const defaultLimit = await signIn();
    expectResponse(
      await requestHold(defaultLimit, [item("info-crewneck", "M", 6)]),
      409,
      "Crewneck is limited to 5 per student.",
    );
    assert.equal(await reservedUnits("info-crewneck"), 0);

    await seedPerStudentLimit("info-baseball-tee", 2);
    const teeFan = await signIn();
    const teeHold = expectHold(await requestHold(teeFan, [item("info-baseball-tee", "M", 2)]));
    assert.equal(teeHold.totalCents, 4400);
    assert.equal(await unitsFor(teeFan, "info-baseball-tee"), 2);
    expectPurchase(await requestConfirm(teeFan, teeHold.id, "tee.fan"));
    expectResponse(
      await requestHold(teeFan, [item("info-baseball-tee", "L")]),
      409,
      "Baseball Tee is limited to 2 per student.",
    );
    assert.equal(await unitsFor(teeFan, "info-baseball-tee"), 2);
    await assertLedgerBalanced();
  });

  it("scenario 4: the 24-unit cap holds for one student and for five concurrent holds", async () => {
    await seedCapacity("info-tote-bag", 23);
    const first = await signIn();
    expectHold(await requestHold(first, [item("info-tote-bag", "One Size")]));
    assert.equal(await reservedUnits("info-tote-bag"), 24);

    const second = await signIn();
    expectResponse(
      await requestHold(second, [item("info-tote-bag", "One Size")]),
      409,
      "Not enough Tote Bag left in this drop.",
    );
    assert.equal(await reservedUnits("info-tote-bag"), 24);

    await seedCapacity("info-crewneck", 23);
    const racers = await Promise.all(Array.from({ length: 5 }, () => signIn()));
    const results = await Promise.all(racers.map((racer) => requestHold(racer, [item("info-crewneck", "M")])));
    assert.deepEqual(
      results.map((response) => response.status).sort((a, b) => a - b),
      [200, 409, 409, 409, 409],
    );
    for (const response of results.filter((result) => result.status === 409)) {
      expectResponse(response, 409, "Not enough Crewneck left in this drop.");
    }
    for (const response of results.filter((result) => result.status === 200)) {
      expectHold(response);
    }
    assert.equal(await reservedUnits("info-crewneck"), 24);
    assert.equal(await models.ShopHolds.countDocuments({ status: "active", "lines.sku": "info-crewneck" }), 1);
    await assertLedgerBalanced();
  });

  it("scenario 5: removing a line releases only that line, and removing the last line cancels the hold", async () => {
    const student = await signIn();
    const created = expectHold(
      await requestHold(student, [item("info-hoodie", "M"), item("info-tote-bag", "One Size")]),
    );

    const trimmed = expectHold(await requestRemoveLine(student, created.id, "info-tote-bag", "One Size"));
    assert.equal(trimmed.status, "active");
    assert.deepEqual(trimmed.lines.map((line) => line.sku), ["info-hoodie"]);
    assert.equal(trimmed.expiresAt, created.expiresAt, "removing a line must not move the deadline");
    assert.equal(await reservedUnits("info-tote-bag"), 0);
    assert.equal(await unitsFor(student, "info-tote-bag"), 0);
    assert.equal(await reservedUnits("info-hoodie"), 1);
    assert.equal(await unitsFor(student, "info-hoodie"), 1);

    const storedTrimmed = await holdDocument(created.id);
    assert.equal(storedTrimmed.status, "active");
    assert.deepEqual(lineFields(storedTrimmed.lines).map((line) => line.sku), ["info-hoodie"]);
    assert.equal(storedTrimmed.expiresAt.toISOString(), created.expiresAt);

    const beforeRejected = await readShopState();
    expectResponse(
      await requestRemoveLine(student, created.id, "info-crewneck", "M"),
      404,
      "That line is not in this hold.",
    );
    assert.deepEqual(await readShopState(), beforeRejected, "a rejected line removal must not change storage");

    const cancelled = expectHold(await requestRemoveLine(student, created.id, "info-hoodie", "M"));
    assert.equal(cancelled.status, "cancelled");
    assert.deepEqual(cancelled.lines, []);
    const storedCancelled = await holdDocument(created.id);
    assert.equal(storedCancelled.status, "cancelled");
    assert.deepEqual(storedCancelled.lines, []);
    assert.equal(await reservedUnits("info-hoodie"), 0);
    assert.equal(await unitsFor(student, "info-hoodie"), 0);
    assert.equal(await reservedUnits("info-tote-bag"), 0);
    assert.equal(await unitsFor(student, "info-tote-bag"), 0);
    await assertLedgerBalanced();
  });

  it("scenario 6: cancelling a hold releases its units, and a second cancel is refused", async () => {
    const student = await signIn();
    const created = expectHold(await requestHold(student, [item("info-hoodie", "M")]));

    const cancelled = expectHold(await requestCancel(student, created.id));
    assert.equal(cancelled.status, "cancelled");
    assert.equal((await holdDocument(created.id)).status, "cancelled");
    assert.equal(await reservedUnits("info-hoodie"), 0);
    assert.equal(await unitsFor(student, "info-hoodie"), 0);

    expectResponse(await requestCancel(student, created.id), 409, "This hold is cancelled.");
    assert.equal(await reservedUnits("info-hoodie"), 0);
    assert.equal(await unitsFor(student, "info-hoodie"), 0);
    await assertLedgerBalanced();
  });

  it("scenario 7: an expired hold is refused on confirm and released by another student's hold", async () => {
    const owner = await signIn();
    const late = expectHold(await requestHold(owner, [item("info-hoodie", "M")]));
    await backdateHold(late.id);

    expectResponse(await requestConfirm(owner, late.id, "jane.doe"), 409, EXPIRED_MESSAGE);
    assert.equal((await holdDocument(late.id)).status, "expired");
    assert.equal(await reservedUnits("info-hoodie"), 0);
    assert.equal(await unitsFor(owner, "info-hoodie"), 0);
    assert.equal(await models.ShopPurchases.countDocuments({}), 0);

    const abandoned = expectHold(await requestHold(owner, [item("info-hoodie", "M")]));
    await backdateHold(abandoned.id);
    const other = await signIn();
    expectHold(await requestHold(other, [item("info-hoodie", "M")]));

    assert.equal(
      (await holdDocument(abandoned.id)).status,
      "expired",
      "the other student's request must expire the abandoned hold",
    );
    assert.equal(await unitsFor(owner, "info-hoodie"), 0);
    assert.equal(await unitsFor(other, "info-hoodie"), 1);
    assert.equal(await reservedUnits("info-hoodie"), 1);
    await assertLedgerBalanced();
  });

  it("scenario 8: a student cannot read or change another student's hold", async () => {
    const owner = await signIn();
    const other = await signIn();
    const held = expectHold(await requestHold(owner, [item("info-hoodie", "M")]));
    const before = await readShopState();

    expectResponse(await requestGetHold(other, held.id), 404, "Hold not found.");
    expectResponse(await requestRemoveLine(other, held.id, "info-hoodie", "M"), 404, "Hold not found.");
    expectResponse(await requestCancel(other, held.id), 404, "Hold not found.");
    expectResponse(await requestConfirm(other, held.id, "jane.doe"), 404, "Hold not found.");

    assert.deepEqual(await readShopState(), before);
    assert.equal(await reservedUnits("info-hoodie"), 1);
    assert.equal(await unitsFor(owner, "info-hoodie"), 1);
    assert.equal(await unitsFor(other, "info-hoodie"), 0);
    await assertLedgerBalanced();
  });

  it("scenario 9: concurrent duplicate confirms have one winner, and concurrent duplicate holds leave one active hold", async () => {
    const buyer = await signIn();
    const held = expectHold(await requestHold(buyer, [item("info-hoodie", "M")]));
    const confirms = await Promise.all([
      requestConfirm(buyer, held.id, "jane.doe"),
      requestConfirm(buyer, held.id, "jane.doe"),
    ]);
    assert.deepEqual(confirms.map((response) => response.status).sort((a, b) => a - b), [200, 409]);
    assert.equal(await models.ShopPurchases.countDocuments({}), 1);
    assert.equal((await holdDocument(held.id)).status, "confirmed");

    const racer = await signIn();
    const holds = await Promise.all([
      requestHold(racer, [item("info-crewneck", "M")]),
      requestHold(racer, [item("info-crewneck", "M")]),
    ]);
    // A new hold replaces the student's earlier one, so both requests succeed and one hold stays active.
    assert.deepEqual(holds.map((response) => response.status), [200, 200]);
    assert.equal(await models.ShopHolds.countDocuments({ userId: racer.userId, status: "active" }), 1);
    assert.equal(await models.ShopHolds.countDocuments({ userId: racer.userId, status: "cancelled" }), 1);
    assert.equal(await unitsFor(racer, "info-crewneck"), 1);
    await assertLedgerBalanced();
  });

  it("scenario 10: bad input is refused and changes no stored document", async () => {
    const student = await signIn();
    const held = expectHold(await requestHold(student, [item("info-hoodie", "M")]));
    const before = await readShopState();

    expectResponse(await requestConfirm(student, held.id, "has spaces"), 400);
    expectResponse(
      await send(primary, "POST", HOLDS_PATH, {
        student,
        body: { catalogVersion: "stale", items: [item("info-hoodie", "M")] },
      }),
      409,
      "The shop was updated. Please review your cart and check out again.",
    );
    expectResponse(await requestGetHold(student, held.id.slice(0, 23)), 404, "Hold not found.");
    expectResponse(
      await send(primary, "POST", HOLDS_PATH, {
        student,
        origin: null,
        body: { catalogVersion, items: [item("info-hoodie", "M")] },
      }),
      403,
      "CSRF validation failed",
    );

    assert.deepEqual(await readShopState(), before);
    await assertLedgerBalanced();
  });

  it("scenario 11: the ledger balances after a confirm, a cancel, a line removal, and an open hold", async () => {
    const confirmer = await signIn();
    const confirmed = expectHold(await requestHold(confirmer, [item("info-hoodie", "M")]));
    expectPurchase(await requestConfirm(confirmer, confirmed.id, "jane.doe"));

    const canceller = await signIn();
    const cancelled = expectHold(await requestHold(canceller, [item("info-crewneck", "M")]));
    assert.equal(expectHold(await requestCancel(canceller, cancelled.id)).status, "cancelled");

    const trimmer = await signIn();
    const trimmed = expectHold(
      await requestHold(trimmer, [item("info-baseball-tee", "M"), item("info-tote-bag", "One Size")]),
    );
    expectHold(await requestRemoveLine(trimmer, trimmed.id, "info-tote-bag", "One Size"));

    const holder = await signIn();
    expectHold(await requestHold(holder, [item("info-hoodie", "L")]));

    assert.equal(await models.ShopHolds.countDocuments({ status: "confirmed" }), 1);
    assert.equal(await models.ShopHolds.countDocuments({ status: "cancelled" }), 1);
    assert.equal(await models.ShopHolds.countDocuments({ status: "active" }), 2);
    assert.equal(await reservedUnits("info-hoodie"), 2);
    assert.equal(await reservedUnits("info-crewneck"), 0);
    assert.equal(await reservedUnits("info-baseball-tee"), 1);
    assert.equal(await reservedUnits("info-tote-bag"), 0);
    await assertLedgerBalanced();
  });

  it("scenario 12: with manual checkout off, a signed-in hold request gets 503 and writes nothing", async () => {
    const closed = await startServer({ manualCheckoutExposed: false });
    try {
      const student = await signIn(closed);
      const response = await send(closed, "POST", HOLDS_PATH, {
        student,
        body: { catalogVersion, items: [item("info-hoodie", "M")] },
      });
      expectResponse(response, 503, CLOSED_MESSAGE);
      for (const name of SHOP_MODEL_NAMES) {
        assert.equal(await models[name].countDocuments({}), 0, `${name} must stay empty while checkout is closed`);
      }
    } finally {
      await stopServer(closed);
    }
    await assertLedgerBalanced();
  });
});
