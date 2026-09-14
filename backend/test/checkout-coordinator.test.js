/*
 * @behavior Prove the two promises this flow makes: a purchase is written down before any money
 *           moves, and one press of Pay — however often retried — produces one attempt and one
 *           Stripe payment link.
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
const OWNER_A = { type: "user", userId: "user-a" };
const OWNER_B = { type: "user", userId: "user-b" };
const RETRY_KEY_A = "550e8400-e29b-41d4-a716-446655440000";
const RETRY_KEY_B = "550e8400-e29b-41d4-a716-446655440001";
const ONE_HOODIE = [{ skuKey: "hoodie", quantity: 1 }];

const activeSalesWindow = {
  dropKey: "fall-2026",
  catalogVersion: 7,
  currency: "usd",
  isEnabled: true,
  opensAt: new Date("2026-09-01T00:00:00.000Z"),
  closesAt: new Date("2026-12-01T00:00:00.000Z"),
};

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

// Catalog rows arrive as Mongoose documents, so the fixture takes that shape too.
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
  const providerCalls = [];
  const providerRetrievals = [];
  const provider = options.provider ?? {
    async createCheckoutSession(request) {
      providerCalls.push(request);
      return {
        id: `cs_test_${providerCalls.length}`,
        url: `https://checkout.test/${providerCalls.length}`,
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
        paymentIntentId: `pi_test_${providerCalls.length}`,
        status: "open",
      };
    },
    async retrieveCheckoutSession(request) {
      providerRetrievals.push(request);
      return {
        id: request.sessionId,
        url: "https://checkout.test/retrieved",
        expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
        paymentIntentId: "pi_retrieved",
        status: "open",
      };
    },
  };
  let id = 0;
  return {
    models,
    providerCalls,
    providerRetrievals,
    checkout(args) {
      return createCheckout({
        models,
        owner: OWNER_A,
        attemptKey: RETRY_KEY_A,
        items: ONE_HOODIE,
        checkoutEnabled: true,
        baseUrl: "https://shop.test",
        now: () => NOW,
        getProvider: async () => provider,
        transaction: async (work) => work({ transactionId: "tx_test" }),
        createId: (prefix) => `${prefix}_test_${++id}`,
        ...args,
      });
    },
  };
}

function pendingAttemptFixture({ id = "attempt-seeded", reference = "ORD-SEEDED" } = {}) {
  return {
    _id: id,
    owner: OWNER_A,
    attemptKey: RETRY_KEY_A,
    cartFingerprint: '[{"skuKey":"hoodie","quantity":1}]',
    status: "pending",
    orderId: `order-${id}`,
    sessionId: null,
    providerIdempotencyKey: `iuga:checkout:${id}`,
    frozenStripeRequest: {
      lineItems: [{ priceId: "price_hoodie_test", quantity: 1 }],
      successUrl: "https://shop.test/shop/checkout/success",
      cancelUrl: "https://shop.test/shop/checkout/cancel",
      expiresAt: Math.floor(NOW.getTime() / 1000) + 3600,
      clientReferenceId: `order-${id}`,
      metadata: { attempt: id, order: `order-${id}` },
    },
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    firstSubmissionAt: NOW,
    orderReference: reference,
  };
}

describe("createCheckout: one attempt, one payment link", () => {
  it("holds stock for as long as the payment link lives", async () => {
    const harness = makeHarness();
    const result = await harness.checkout();
    const [attempt] = harness.models._state.attempts;
    const [reservation] = harness.models._state.reservations;

    assert.equal(result.status, "ready");
    assert.equal(reservation.state, "reserved");
    assert.equal(reservation.expiresAt.getTime(), attempt.expiresAt.getTime());
    assert.equal(reservation.expiresAt.getTime(), NOW.getTime() + 60 * 60 * 1000);
  });

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
      assert.equal(harness.providerCalls.length, 0);
    }
  });

  it("returns a payment link for a new purchase and records the attempt behind it", async () => {
    const harness = makeHarness();
    const result = await harness.checkout();
    const [attempt] = harness.models._state.attempts;
    const [order] = harness.models._state.orders;

    assert.equal(result.status, "ready");
    assert.equal(result.isNew, true);
    assert.equal(result.checkoutUrl, "https://checkout.test/1");
    assert.equal(result.attemptKey, RETRY_KEY_A);
    assert.equal(result.orderReference, order.orderReference);

    assert.equal(harness.models._state.attempts.length, 1);
    assert.equal(harness.models._state.orders.length, 1);
    assert.equal(harness.models._state.reservations.length, 1);
    assert.equal(harness.models._state.counters.get("HOODIE-PURPLE-M").available, 9);

    assert.equal(attempt.status, "ready");
    assert.equal(attempt.sessionId, "cs_test_1");
    assert.equal(attempt.expiresAt.getTime(), NOW.getTime() + 60 * 60 * 1000);
    assert.equal(attempt.providerIdempotencyKey, "iuga:checkout:checkout-attempt_test_1");
    assert.equal(attempt.frozenStripeRequest.successUrl, "https://shop.test/shop/checkout/success");
    assert.equal(attempt.frozenStripeRequest.clientReferenceId, order._id);

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
    assert.equal(harness.providerCalls.length, 0);
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

      const result = await harness.checkout({ items: ONE_HOODIE });

      assert.equal(result.status, "unavailable");
      assert.equal(models._state.orders.length, 0);
      assert.equal(models._state.attempts.length, 0);
      assert.equal(models._state.reservations.length, 0);
      assert.equal(harness.providerCalls.length, 0);
    }

    const soldOut = makeHarness({ available: 0 });
    const result = await soldOut.checkout({ items: ONE_HOODIE });
    assert.equal(result.status, "unavailable");
    assert.equal(soldOut.models._state.orders.length, 0);
    assert.equal(soldOut.models._state.attempts.length, 0);
    assert.equal(soldOut.providerCalls.length, 0);

    // A preorder is sold before we own it, so nothing is held for it.
    const preorder = makeHarness({ available: 0 });
    const preorderResult = await preorder.checkout({ items: [{ skuKey: "sticker", quantity: 3 }] });
    assert.equal(preorderResult.status, "ready");
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

    assert.equal(result.status, "ready");
    assert.equal(harness.models._state.orders[0].totalMinor, 6500);
    assert.equal(harness.providerCalls[0].frozenStripeRequest.lineItems[0].priceId, "price_hoodie_test");
  });

  it("prices from the active catalog revision, ignoring older rows for the same variant", async () => {
    const models = makeModels();
    const currentRow = { ...catalogRows[0], catalogVersion: 7, priceId: "price_current" };
    const staleRow = { ...catalogRows[0], catalogVersion: 6, priceId: "price_stale" };
    models.CatalogEntry.find = async (filter = {}) => (filter.catalogVersion === 7 ? [currentRow] : [staleRow]);
    const harness = makeHarness({ models });

    const result = await harness.checkout();

    assert.equal(result.status, "ready");
    assert.equal(harness.providerCalls[0].frozenStripeRequest.lineItems[0].priceId, "price_current");
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

    assert.equal(result.status, "ready");
    assert.equal(catalogFilter.dropKey, openNow.dropKey);
    assert.notEqual(catalogFilter.dropKey, later.dropKey);
    assert.equal(models._state.attempts[0].dropKey, "open-now");
  });

  it("replays the same attempt when the buyer presses Pay again", async () => {
    const harness = makeHarness();
    const first = await harness.checkout({ items: [{ skuKey: "tote", quantity: 1 }, { skuKey: "hoodie", quantity: 2 }] });
    const second = await harness.checkout({ items: [{ skuKey: "hoodie", quantity: 2 }, { skuKey: "tote", quantity: 1 }] });

    assert.equal(first.status, "ready");
    assert.equal(first.isNew, true);
    assert.equal(second.status, "ready");
    assert.equal(second.isNew, false);
    assert.equal(second.orderReference, first.orderReference);
    assert.equal(harness.models._state.orders.length, 1);
    assert.equal(harness.models._state.attempts.length, 1);
    assert.equal(harness.models._state.reservations.length, 2);
    assert.equal(harness.providerCalls.length, 1);
    assert.equal(harness.providerRetrievals.length, 1);
    assert.equal(harness.providerRetrievals[0].sessionId, harness.models._state.attempts[0].sessionId);
    assert.equal(second.checkoutUrl, "https://checkout.test/retrieved");
  });

  it("treats the same retry key with a different cart as a conflict", async () => {
    const harness = makeHarness();
    await harness.checkout();
    const result = await harness.checkout({ items: [{ skuKey: "tote", quantity: 1 }] });

    assert.equal(result.status, "conflict");
    assert.equal(harness.models._state.orders.length, 1);
    assert.equal(harness.models._state.attempts.length, 1);
    assert.equal(harness.providerCalls.length, 1);
  });

  it("keeps one buyer's retry key out of another buyer's attempt", async () => {
    const harness = makeHarness();
    const first = await harness.checkout({ owner: OWNER_A, attemptKey: RETRY_KEY_B });
    const second = await harness.checkout({ owner: OWNER_B, attemptKey: RETRY_KEY_B });

    assert.equal(first.status, "ready");
    assert.equal(second.status, "ready");
    assert.equal(harness.models._state.orders.length, 2);
    assert.equal(harness.models._state.attempts.length, 2);
    assert.notEqual(harness.providerCalls[0].idempotencyKey, harness.providerCalls[1].idempotencyKey);
  });

  it("replays an existing attempt even when checkout has been switched off", async () => {
    const harness = makeHarness();
    const created = await harness.checkout();
    harness.models._state.attempts[0].status = "pending";
    const replay = await harness.checkout({ checkoutEnabled: false });

    assert.equal(replay.status, "pending");
    assert.equal(replay.orderReference, created.orderReference);
    assert.equal(replay.checkoutUrl, undefined);
    assert.equal(harness.providerCalls.length, 1);
    assert.equal(harness.models._state.orders.length, 1);

    const fresh = makeHarness();
    const unavailable = await fresh.checkout({ checkoutEnabled: false, attemptKey: RETRY_KEY_B });
    assert.equal(unavailable.status, "unavailable");
    assert.equal(fresh.models._state.calls.writes, 0);
    assert.equal(fresh.providerCalls.length, 0);
  });

  it("replays durable state before checking the shop's own address", async () => {
    const harness = makeHarness();
    await harness.checkout();
    harness.models._state.attempts[0].status = "pending";

    const result = await harness.checkout({ checkoutEnabled: false, baseUrl: undefined });

    assert.equal(result.status, "pending");
    assert.equal(harness.providerCalls.length, 1);
  });

  it("asks for a human check when Stripe's answer cannot be explained", async () => {
    const provider = {
      async createCheckoutSession() {
        throw new Error("timeout");
      },
    };
    const harness = makeHarness({ provider });
    const first = await harness.checkout();
    const second = await harness.checkout();

    assert.equal(first.status, "reconciliation_required");
    assert.equal(first.checkoutUrl, undefined);
    assert.equal(second.status, "reconciliation_required");
    assert.equal(harness.models._state.attempts[0].status, "reconciliation_required");
    assert.equal(harness.models._state.orders.length, 1);
    assert.equal(harness.models._state.reservations.length, 1);
  });

  it("keeps a payment link that a concurrent duplicate request attached", async () => {
    const fixture = pendingAttemptFixture();
    const models = makeModels({
      attempts: [fixture],
      orders: [{ _id: fixture.orderId, orderReference: fixture.orderReference }],
    });
    let attachWinner = async () => {};
    const harness = makeHarness({
      models,
      provider: {
        async createCheckoutSession() {
          await attachWinner();
          throw new Error("transport failure");
        },
        async retrieveCheckoutSession({ sessionId }) {
          return {
            id: sessionId,
            url: "https://checkout.test/winner",
            expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
            paymentIntentId: "pi_winner",
            status: "open",
          };
        },
      },
    });
    attachWinner = () => models.CheckoutAttempt.findOneAndUpdate(
      { "owner.userId": OWNER_A.userId, attemptKey: RETRY_KEY_A, status: "pending" },
      { $set: { status: "ready", sessionId: "cs_winner", paymentIntentId: "pi_winner" } },
    );

    // The request cannot tell whether Stripe made a link, but the winner already stored one.
    const failed = await harness.checkout();
    assert.equal(failed.status, "reconciliation_required");
    assert.equal(models._state.attempts[0].status, "ready");
    assert.equal(models._state.attempts[0].sessionId, "cs_winner");

    const replay = await harness.checkout();
    assert.equal(replay.status, "ready");
    assert.equal(replay.checkoutUrl, "https://checkout.test/winner");
  });

  it("re-reads the winner when another request is writing the same attempt", async () => {
    const models = makeModels();
    const winner = {
      _id: "attempt-winner",
      owner: OWNER_A,
      attemptKey: RETRY_KEY_A,
      cartFingerprint: JSON.stringify(ONE_HOODIE),
      orderId: "order-winner",
      status: "pending",
    };
    let lookups = 0;
    models.CheckoutAttempt.findOne = async () => {
      lookups += 1;
      return lookups === 1 ? null : winner;
    };
    models.CheckoutAttempt.create = async () => {
      throw Object.assign(new Error("duplicate key"), { code: 11000 });
    };
    models.Order.findById = async () => ({ _id: "order-winner", orderReference: "ORD-WINNER" });
    const harness = makeHarness({ models });

    const result = await harness.checkout();

    assert.equal(result.status, "pending");
    assert.equal(result.orderReference, "ORD-WINNER");
    assert.equal(harness.providerCalls.length, 0);
  });

  it("stops acting on an attempt that is finished or too old", async () => {
    for (const status of ["reconciliation_required", "expired", "failed"]) {
      const harness = makeHarness();
      await harness.checkout();
      harness.providerCalls.length = 0;
      harness.models._state.attempts[0].status = status;

      const result = await harness.checkout();

      assert.equal(result.status, status);
      assert.equal(result.checkoutUrl, undefined);
      assert.equal(harness.providerCalls.length, 0);
    }

    for (const age of [
      (attempt) => { attempt.expiresAt = new Date(NOW.getTime() - 1); },
      (attempt) => { attempt.firstSubmissionAt = new Date(NOW.getTime() - 23 * 60 * 60 * 1000 - 1); },
    ]) {
      const harness = makeHarness();
      await harness.checkout();
      harness.providerCalls.length = 0;
      harness.models._state.attempts[0].status = "pending";
      age(harness.models._state.attempts[0]);

      const result = await harness.checkout();

      assert.equal(result.status, "reconciliation_required");
      assert.equal(harness.providerCalls.length, 0);
    }
  });

  it("never hands out a payment link that is closed or already expired", async () => {
    for (const session of [
      { id: "cs_complete", url: "https://checkout.test/complete", status: "complete", expiresAt: new Date(NOW.getTime() + 1000) },
      { id: "cs_expired", url: "https://checkout.test/expired", status: "open", expiresAt: NOW },
    ]) {
      const harness = makeHarness({ provider: { createCheckoutSession: async () => session } });

      const result = await harness.checkout();

      assert.notEqual(result.status, "ready");
      assert.equal(result.checkoutUrl, undefined);
      assert.notEqual(harness.models._state.attempts[0]?.sessionId, session.id);
    }
  });

  it("accepts a Stripe expiry reported in epoch seconds", async () => {
    const session = {
      id: "cs_epoch",
      url: "https://checkout.test/epoch",
      expiresAt: Math.floor(NOW.getTime() / 1000) + 3600,
      paymentIntentId: "pi_epoch",
      status: "open",
    };
    const harness = makeHarness({ provider: { createCheckoutSession: async () => session } });

    const result = await harness.checkout();

    assert.equal(result.status, "ready");
    assert.equal(result.checkoutUrl, session.url);
    assert.equal(harness.models._state.attempts[0].sessionId, session.id);
  });
});
