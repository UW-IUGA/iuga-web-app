/*
Purpose: Prove the durable step of checkout behaves: a cart becomes exactly one priced
         attempt with its stock held, the buyer's retry key selects that attempt, and nothing
         is written at all when any check fails.
*/

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import mongoose from "mongoose";

import { catalogEntrySchema } from "../schemas/schemas.js";
import {
  CheckoutValidationError,
  createCheckout,
} from "../services/checkoutCoordinator.js";

const NOW = new Date("2026-10-01T12:00:00.000Z");
const OWNER = { type: "user", userId: "user-a" };
const RETRY_KEY = "550e8400-e29b-41d4-a716-446655440000";

// One sale window ("drop"): the same shop can run several, each with its own price list.
const activeSalesWindow = {
  dropKey: "fall-2026",
  catalogVersion: 7,
  currency: "usd",
  isEnabled: true,
  opensAt: new Date("2026-09-01T00:00:00.000Z"),
  closesAt: new Date("2026-12-01T00:00:00.000Z"),
};

// skuKey is what the shop page sells ("the hoodie, purple, size M"); fulfillmentSku is the
// pile of stock we actually count — several sellable variants can come out of the same pile.
const catalogRows = [
  {
    skuKey: "hoodie",
    title: "Info Hoodie",
    variant: "purple-m",
    priceId: "price_hoodie_test",
    unitAmountMinor: 6500,
    isEnabled: true,
    maxPerOrder: 2,
    inventoryPolicy: "finite",
    fulfillmentSku: "HOODIE-PURPLE-M",
  },
  {
    skuKey: "tote",
    title: "Info Tote Bag",
    variant: "natural",
    priceId: "price_tote_test",
    unitAmountMinor: 1800,
    isEnabled: true,
    inventoryPolicy: "finite",
    fulfillmentSku: "TOTE-NATURAL",
  },
  {
    skuKey: "sticker",
    title: "Sticker Pack",
    isEnabled: true,
    priceId: "price_sticker_test",
    unitAmountMinor: 500,
    inventoryPolicy: "preorder",
    fulfillmentSku: "STICKER-PACK",
  },
];

// Real catalog rows arrive as Mongoose documents, so the fixture can take that shape too.
const PersistedCatalogEntry = mongoose.model("CheckoutCoordinatorCatalogEntry", catalogEntrySchema);

function makeModels({ available = 10, attempts = [], orders = [], hydrateCatalog = false } = {}) {
  const rows = hydrateCatalog
    ? catalogRows.map((row) => PersistedCatalogEntry.hydrate({ ...row, dropKey: "fall-2026", catalogVersion: "7" }))
    : catalogRows;
  const state = {
    attempts: attempts.map((value) => ({ ...value })),
    orders: orders.map((value) => ({ ...value })),
    reservations: [],
    counters: new Map([
      ["HOODIE-PURPLE-M", { fulfillmentSku: "HOODIE-PURPLE-M", available, reserved: 0 }],
      ["TOTE-NATURAL", { fulfillmentSku: "TOTE-NATURAL", available, reserved: 0 }],
    ]),
    calls: { reads: 0, writes: 0 },
  };

  const getPath = (doc, path) => path.split(".").reduce((value, part) => value?.[part], doc);
  const matches = (doc, filter = {}) => Object.entries(filter).every(([key, value]) => {
    const actual = getPath(doc, key);
    if (value && typeof value === "object" && "$in" in value) return value.$in.includes(actual);
    return actual === value;
  });
  const model = (collection) => ({
    async findOne(filter) {
      state.calls.reads += 1;
      return state[collection].find((doc) => matches(doc, filter)) ?? null;
    },
    async find(filter = {}) {
      state.calls.reads += 1;
      return state[collection].filter((doc) => matches(doc, filter));
    },
    async create(value) {
      state.calls.writes += 1;
      const docs = Array.isArray(value) ? value : [value];
      state[collection].push(...docs.map((doc) => ({ ...doc })));
      return docs;
    },
    async findOneAndUpdate(filter, update) {
      state.calls.writes += 1;
      const doc = state[collection].find((value) => matches(value, filter));
      if (!doc) return null;
      Object.assign(doc, update.$set ?? {});
      return { ...doc };
    },
  });

  return {
    CatalogEntry: { find: async () => rows },
    ShopDrop: { findOne: async () => activeSalesWindow },
    CheckoutAttempt: model("attempts"),
    Order: {
      ...model("orders"),
      async findById(id) {
        state.calls.reads += 1;
        return state.orders.find((order) => order._id === id) ?? null;
      },
    },
    InventoryCounter: {
      async findOneAndUpdate(filter, update) {
        const counter = state.counters.get(filter.fulfillmentSku);
        if (!counter || counter.available < filter.available.$gte) return null;
        counter.available += update.$inc.available;
        counter.reserved += update.$inc.reserved;
        return { ...counter };
      },
    },
    InventoryReservation: {
      async create(docs) {
        const values = Array.isArray(docs) ? docs : [docs];
        state.reservations.push(...values.map((doc) => ({ ...doc })));
        return values;
      },
    },
    _state: state,
  };
}

function makeHarness(options = {}) {
  const models = options.models ?? makeModels(options);
  let id = 0;
  return {
    models,
    checkout(args) {
      return createCheckout({
        models,
        owner: OWNER,
        attemptKey: RETRY_KEY,
        items: [{ skuKey: "hoodie", quantity: 1 }],
        checkoutEnabled: true,
        baseUrl: "https://shop.test",
        now: () => NOW,
        transaction: async (work) => work({ transactionId: "tx_test" }),
        createId: (prefix) => `${prefix}_test_${++id}`,
        ...args,
      });
    },
  };
}

describe("createCheckout: recording one checkout attempt", () => {
  it("rejects a malformed retry key or cart before reading or writing anything", async () => {
    const cases = [
      { attemptKey: "not-a-uuid" },
      { items: null },
      { items: [] },
      { items: [{ skuKey: "hoodie", quantity: 0 }] },
      { items: [{ skuKey: "hoodie", quantity: 1 }, { skuKey: "hoodie", quantity: 2 }] },
      { items: [{ skuKey: "", quantity: 1 }] },
    ];

    for (const invalid of cases) {
      const harness = makeHarness();
      await assert.rejects(harness.checkout(invalid), CheckoutValidationError);
      assert.equal(harness.models._state.calls.reads, 0);
      assert.equal(harness.models._state.calls.writes, 0);
    }
  });

  it("records the pending order, its stock holds, and the attempt together", async () => {
    const harness = makeHarness();
    const result = await harness.checkout();
    const [attempt] = harness.models._state.attempts;
    const [order] = harness.models._state.orders;

    assert.equal(result.status, "pending");
    assert.equal(result.checkoutUrl, undefined);
    assert.equal(result.attemptKey, RETRY_KEY);
    assert.equal(result.orderReference, order.orderReference);

    // One attempt, one order, one held hoodie — the hold exists because the order does.
    assert.equal(harness.models._state.attempts.length, 1);
    assert.equal(harness.models._state.orders.length, 1);
    assert.equal(harness.models._state.reservations.length, 1);
    assert.equal(harness.models._state.counters.get("HOODIE-PURPLE-M").available, 9);

    assert.equal(attempt.status, "pending");
    assert.equal(attempt.orderId, order._id);
    assert.equal(attempt.expiresAt.getTime(), NOW.getTime() + 60 * 60 * 1000);
    assert.equal(attempt.providerIdempotencyKey, "iuga:checkout:checkout-attempt_test_1");
    assert.equal(attempt.frozenStripeRequest.successUrl, "https://shop.test/shop/checkout/success");
    assert.equal(attempt.frozenStripeRequest.cancelUrl, "https://shop.test/shop/checkout/cancel");
    assert.equal(attempt.frozenStripeRequest.clientReferenceId, order._id);

    // The order carries the prices the buyer saw, in whole cents.
    assert.equal(order.totalMinor, 6500);
    assert.equal(order.currency, "usd");
    assert.equal(order.paymentState, "pending");
    assert.equal(order.fulfillmentState, "pending");
  });

  it("answers unavailable when checkout is switched off, writing nothing", async () => {
    const harness = makeHarness();
    const result = await harness.checkout({ checkoutEnabled: false });

    assert.equal(result.status, "unavailable");
    assert.equal(harness.models._state.calls.writes, 0);
  });

  it("rejects a catalog, price, or stock failure without writing anything", async () => {
    for (const breakRow of [
      (row) => { row.isEnabled = false; },
      (row) => { row.priceId = undefined; },
    ]) {
      const models = makeModels();
      const broken = catalogRows.map((row) => ({ ...row }));
      breakRow(broken[0]);
      models.CatalogEntry.find = async () => broken;
      const harness = makeHarness({ models });

      const result = await harness.checkout({ items: [{ skuKey: "hoodie", quantity: 1 }] });

      assert.equal(result.status, "unavailable");
      assert.equal(models._state.orders.length, 0);
      assert.equal(models._state.attempts.length, 0);
      assert.equal(models._state.reservations.length, 0);
    }

    // Nothing left on the shelf: the hold fails, so no order and no attempt may survive.
    const soldOut = makeHarness({ available: 0 });
    const result = await soldOut.checkout({ items: [{ skuKey: "hoodie", quantity: 1 }] });
    assert.equal(result.status, "unavailable");
    assert.equal(soldOut.models._state.orders.length, 0);
    assert.equal(soldOut.models._state.attempts.length, 0);

    // A preorder item is sold before we own it, so nothing is held for it.
    const preorder = makeHarness({ available: 0 });
    const preorderResult = await preorder.checkout({ items: [{ skuKey: "sticker", quantity: 3 }] });
    assert.equal(preorderResult.status, "pending");
    assert.equal(preorder.models._state.reservations.length, 0);
  });

  it("rejects a quantity above the per-order limit before writing anything", async () => {
    const harness = makeHarness();
    const result = await harness.checkout({ items: [{ skuKey: "hoodie", quantity: 3 }] });

    assert.equal(result.status, "unavailable");
    assert.equal(harness.models._state.orders.length, 0);
    assert.equal(harness.models._state.calls.writes, 0);
  });

  it("prices the purchase from persisted catalog documents", async () => {
    const harness = makeHarness({ hydrateCatalog: true });
    const result = await harness.checkout();

    assert.equal(result.status, "pending");
    assert.equal(harness.models._state.orders[0].totalMinor, 6500);
    assert.equal(harness.models._state.attempts[0].frozenStripeRequest.lineItems[0].priceId, "price_hoodie_test");
  });

  it("prices from the active catalog revision, ignoring older rows for the same variant", async () => {
    const models = makeModels();
    const currentRow = { ...catalogRows[0], catalogVersion: 7, priceId: "price_current" };
    const staleRow = { ...catalogRows[0], catalogVersion: 6, priceId: "price_stale" };
    models.CatalogEntry.find = async (filter = {}) => (filter.catalogVersion === 7 ? [currentRow] : [staleRow]);
    const harness = makeHarness({ models });

    const result = await harness.checkout();

    assert.equal(result.status, "pending");
    assert.equal(models._state.attempts[0].frozenStripeRequest.lineItems[0].priceId, "price_current");
  });

  it("prices from the sale window that is open right now", async () => {
    const closed = { ...activeSalesWindow, dropKey: "closed", opensAt: new Date("2026-01-01T00:00:00.000Z"), closesAt: new Date("2026-02-01T00:00:00.000Z") };
    const openNow = { ...activeSalesWindow, dropKey: "open-now", opensAt: new Date("2026-09-01T00:00:00.000Z"), closesAt: new Date("2026-12-01T00:00:00.000Z") };
    const later = { ...activeSalesWindow, dropKey: "later", opensAt: new Date("2026-11-01T00:00:00.000Z"), closesAt: new Date("2027-01-01T00:00:00.000Z") };
    const models = makeModels();
    let catalogFilter;
    models.CatalogEntry.find = async (filter = {}) => {
      catalogFilter = filter;
      return catalogRows;
    };
    models.ShopDrop.findOne = async (filter = {}) => (filter.opensAt?.$lte && filter.closesAt?.$gt ? openNow : closed);
    const harness = makeHarness({ models });

    const result = await harness.checkout();

    assert.equal(result.status, "pending");
    assert.equal(catalogFilter.dropKey, openNow.dropKey);
    assert.notEqual(catalogFilter.dropKey, later.dropKey);
    assert.equal(models._state.attempts[0].dropKey, "open-now");
  });

  it("answers unavailable when the same retry key is already being written", async () => {
    const models = makeModels();
    models.CheckoutAttempt.create = async () => {
      throw Object.assign(new Error("duplicate key"), { code: 11000 });
    };
    const harness = makeHarness({ models });

    const result = await harness.checkout();

    assert.equal(result.status, "unavailable");
    assert.equal(result.orderReference, undefined);
    // The order and the attempt are written in one database transaction, so the database
    // discards the order when the attempt insert loses the race; this fake has no rollback.
    assert.equal(models._state.attempts.length, 0);
  });
});
