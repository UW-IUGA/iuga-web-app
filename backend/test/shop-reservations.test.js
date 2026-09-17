/*
 * @behavior Pin the stock promises: the last hoodie cannot be sold twice, a half-finished order
 *           gives its stock back, and stock only returns to the shelf once the payment link can
 *           no longer be paid.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  holdInventory,
  consumeInventory,
  releaseInventory,
  InsufficientInventoryError,
} from "../shop/reservations.js";

// Match a filter the way the database does: every key must hold, and a query this double does not
// implement is an error rather than a silent pass.
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    if (expected === null || typeof expected !== "object") return doc[key] === expected;
    const operators = Object.keys(expected);
    if (operators.some((operator) => operator !== "$gte")) {
      throw new Error(`Fake does not implement filter operator(s): ${operators.join(", ")}`);
    }
    return operators.length === 0 || doc[key] >= expected.$gte;
  });
}

// Apply an update the way the database does, refusing an operator this double does not implement.
function applyUpdate(doc, update = {}) {
  for (const [operator, fields] of Object.entries(update)) {
    if (operator !== "$inc" && operator !== "$set") {
      throw new Error(`Fake does not implement update operator: ${operator}`);
    }
    for (const [key, value] of Object.entries(fields)) {
      doc[key] = operator === "$inc" ? (doc[key] || 0) + value : value;
    }
  }
}

function makeFakeModels(initialCounters = [], initialReservations = []) {
  const counters = new Map(initialCounters.map((c) => [c.fulfillmentSku, { ...c }]));
  const reservations = [...initialReservations.map((r) => ({ ...r }))];

  return {
    InventoryCounter: {
      async findOneAndUpdate(filter, update) {
        const doc = counters.get(filter.fulfillmentSku);
        if (!doc || !matches(doc, filter)) return null;

        applyUpdate(doc, update);
        return { ...doc };
      },
      _getCounters() {
        return Array.from(counters.values());
      },
      _restoreCounters(snapshot) {
        counters.clear();
        for (const counter of snapshot) counters.set(counter.fulfillmentSku, { ...counter });
      },
    },
    InventoryReservation: {
      async create(docs, options = {}) {
        // The real model only accepts save options alongside an array, and refuses a session with
        // several documents unless they are ordered — so does this double.
        if (!Array.isArray(docs)) {
          throw new Error("Model.create() options require an array of documents");
        }
        if (options.session && !options.ordered && docs.length > 1) {
          throw new Error("Cannot call create() with a session and multiple documents unless ordered: true is set");
        }
        for (const doc of docs) reservations.push({ ...doc });
        return docs;
      },
      async find(filter = {}) {
        return reservations.filter((reservation) => matches(reservation, filter));
      },
      async findOneAndUpdate(filter, update) {
        // Claiming runs to completion without yielding, so two callers cannot both win.
        const doc = reservations.find((reservation) => matches(reservation, filter));
        if (!doc) return null;

        applyUpdate(doc, update);
        return { ...doc };
      },
      _getReservations() {
        return reservations;
      },
      _restoreReservations(snapshot) {
        reservations.length = 0;
        for (const reservation of snapshot) reservations.push({ ...reservation });
      },
    },
  };
}

// Mirrors mongoose.connection.transaction: the writes inside are undone when the callback throws.
// That is what makes "the counter and its reservation move together" testable without a database.
async function withTransaction(models, work) {
  const counters = models.InventoryCounter._getCounters().map((counter) => ({ ...counter }));
  const reservations = models.InventoryReservation._getReservations().map((reservation) => ({ ...reservation }));

  try {
    return await work({ id: "test-transaction" });
  } catch (error) {
    models.InventoryCounter._restoreCounters(counters);
    models.InventoryReservation._restoreReservations(reservations);
    throw error;
  }
}

describe("Shop Inventory Reservations and Fencing", () => {
  const sampleCatalog = [
    {
      skuKey: "info-hoodie-purple-m",
      fulfillmentSku: "HOODIE-PURPLE-M",
      inventoryPolicy: "finite",
    },
    {
      skuKey: "info-tote-bag-natural",
      fulfillmentSku: "TOTE-NATURAL",
      inventoryPolicy: "finite",
    },
    {
      skuKey: "info-sticker-pack",
      fulfillmentSku: "STICKER-PACK",
      inventoryPolicy: "preorder",
    },
  ];

  describe("holdInventory", () => {
    it("reserves finite stock and records reservation documents", async () => {
      const models = makeFakeModels([
        { fulfillmentSku: "HOODIE-PURPLE-M", available: 10, reserved: 0, consumed: 0, version: 1 },
      ]);

      const items = [{ skuKey: "info-hoodie-purple-m", quantity: 2 }];
      const now = new Date("2026-10-01T12:00:00.000Z");

      const returned = await withTransaction(models, (session) => holdInventory({
        models,
        orderId: "ord_1",
        items,
        catalog: sampleCatalog,
        now,
        ttlMs: 15 * 60 * 1000,
        session,
      }));

      assert.equal(returned.length, 1);

      // The record has to exist in the store, not just in what the call handed back.
      const stored = models.InventoryReservation._getReservations();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].skuKey, "info-hoodie-purple-m");
      assert.equal(stored[0].quantity, 2);
      assert.equal(stored[0].state, "reserved");
      assert.deepEqual(stored[0].expiresAt, new Date("2026-10-01T12:15:00.000Z"));

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 8);
      assert.equal(counter.reserved, 2);
    });

    it("holds several variants of one cart in a single transaction", async () => {
      const models = makeFakeModels([
        { fulfillmentSku: "HOODIE-PURPLE-M", available: 5, reserved: 0, consumed: 0, version: 1 },
        { fulfillmentSku: "TOTE-NATURAL", available: 5, reserved: 0, consumed: 0, version: 1 },
      ]);

      const items = [
        { skuKey: "info-hoodie-purple-m", quantity: 1 },
        { skuKey: "info-tote-bag-natural", quantity: 2 },
      ];

      const held = await withTransaction(models, (session) => holdInventory({
        models,
        orderId: "ord_two_variants",
        items,
        catalog: sampleCatalog,
        session,
      }));

      assert.equal(held.length, 2);
      assert.equal(models.InventoryReservation._getReservations().length, 2);

      const available = Object.fromEntries(
        models.InventoryCounter._getCounters().map((counter) => [counter.fulfillmentSku, counter.available]),
      );
      assert.deepEqual(available, { "HOODIE-PURPLE-M": 4, "TOTE-NATURAL": 3 });
    });

    it("skips inventory deduction for preorder items", async () => {
      const models = makeFakeModels([
        { fulfillmentSku: "STICKER-PACK", available: 0, reserved: 0, consumed: 0, version: 1 },
      ]);

      const items = [{ skuKey: "info-sticker-pack", quantity: 5 }];
      const reservations = await withTransaction(models, (session) => holdInventory({
        models,
        orderId: "ord_preorder",
        items,
        catalog: sampleCatalog,
        session,
      }));

      assert.equal(reservations.length, 0);
      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 0);
      assert.equal(counter.reserved, 0);
    });

    it("rejects reservation when available stock is insufficient without underflowing", async () => {
      const models = makeFakeModels([
        { fulfillmentSku: "HOODIE-PURPLE-M", available: 1, reserved: 0, consumed: 0, version: 1 },
      ]);

      const items = [{ skuKey: "info-hoodie-purple-m", quantity: 2 }];

      await assert.rejects(
        async () => {
          await withTransaction(models, (session) => holdInventory({
            models,
            orderId: "ord_fail",
            items,
            catalog: sampleCatalog,
            session,
          }));
        },
        (err) => {
          assert.ok(err instanceof InsufficientInventoryError);
          assert.equal(err.skuKey, "info-hoodie-purple-m");
          return true;
        },
      );

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 1); // A failed reservation never touches the counter
      assert.equal(counter.reserved, 0);
    });

    it("rolls back partial holds if subsequent item in cart is out of stock", async () => {
      const models = makeFakeModels([
        { fulfillmentSku: "HOODIE-PURPLE-M", available: 5, reserved: 0, consumed: 0, version: 1 },
        { fulfillmentSku: "TOTE-NATURAL", available: 0, reserved: 0, consumed: 0, version: 1 },
      ]);

      const items = [
        { skuKey: "info-hoodie-purple-m", quantity: 2 },
        { skuKey: "info-tote-bag-natural", quantity: 1 },
      ];

      await assert.rejects(
        async () => {
          await withTransaction(models, (session) => holdInventory({
            models,
            orderId: "ord_multi_fail",
            items,
            catalog: sampleCatalog,
            session,
          }));
        },
        InsufficientInventoryError,
      );

      const hoodie = models.InventoryCounter._getCounters().find((c) => c.fulfillmentSku === "HOODIE-PURPLE-M");
      assert.equal(hoodie.available, 5);
      assert.equal(hoodie.reserved, 0);
      assert.equal(models.InventoryReservation._getReservations().length, 0);
    });

    it("rolls back counter holds if InventoryReservation creation throws", async () => {
      const models = makeFakeModels([
        { fulfillmentSku: "HOODIE-PURPLE-M", available: 5, reserved: 0, consumed: 0, version: 1 },
      ]);
      models.InventoryReservation.create = async () => {
        throw new Error("Simulated database write failure");
      };

      const items = [{ skuKey: "info-hoodie-purple-m", quantity: 2 }];

      await assert.rejects(
        async () => {
          await withTransaction(models, (session) => holdInventory({
            models,
            orderId: "ord_insert_fail",
            items,
            catalog: sampleCatalog,
            session,
          }));
        },
        /Simulated database write failure/,
      );

      const hoodie = models.InventoryCounter._getCounters().find((c) => c.fulfillmentSku === "HOODIE-PURPLE-M");
      assert.equal(hoodie.available, 5); // A failed reservation never touches the counter
      assert.equal(hoodie.reserved, 0);
    });
  });

  describe("consumeInventory", () => {
    it("transitions reserved stock to consumed upon verified payment", async () => {
      const models = makeFakeModels(
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 2, consumed: 0, version: 2 }],
        [{ orderId: "ord_paid", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 2, state: "reserved" }],
      );

      const result = await withTransaction(models, (session) => consumeInventory({
        models,
        orderId: "ord_paid",
        session,
      }));

      assert.equal(result.consumedCount, 1);

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 8);
      assert.equal(counter.reserved, 0);
      assert.equal(counter.consumed, 2);

      const res = models.InventoryReservation._getReservations()[0];
      assert.equal(res.state, "consumed");
    });

    it("consumes a hold once when the same order is consumed twice at the same time", async () => {
      const models = makeFakeModels(
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 2, consumed: 0, version: 2 }],
        [
          { orderId: "ord_a", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 1, state: "reserved" },
          { orderId: "ord_b", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 1, state: "reserved" },
        ],
      );
      const session = { id: "test-transaction" };

      const [first, second] = await Promise.all([
        consumeInventory({ models, orderId: "ord_a", session }),
        consumeInventory({ models, orderId: "ord_a", session }),
      ]);

      assert.equal(first.consumedCount + second.consumedCount, 1);

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.consumed, 1); // One sale, not two
      assert.equal(counter.reserved, 1); // The other order's unit is untouched
    });

    it("refuses to consume reservation if counter conditional update fails", async () => {
      const models = makeFakeModels(
        // reserved is below the hold quantity, so the fence must fail
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 0, consumed: 2, version: 2 }],
        [{ orderId: "ord_lost_fence", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 2, state: "reserved" }],
      );

      await assert.rejects(
        async () => {
          await withTransaction(models, (session) => consumeInventory({
            models,
            orderId: "ord_lost_fence",
            session,
          }));
        },
        /counter fence lost/i,
      );

      // The transaction takes the claim back with it, so the hold survives intact.
      const res = models.InventoryReservation._getReservations()[0];
      assert.equal(res.state, "reserved");
      assert.equal(models.InventoryCounter._getCounters()[0].consumed, 2);
    });
  });

  describe("releaseInventory", () => {
    it("keeps stock held until we can verify the payment link is dead", async () => {
      const models = makeFakeModels(
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 2, consumed: 0, version: 2 }],
        [{ orderId: "ord_open", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 2, state: "reserved" }],
      );

      await assert.rejects(
        async () => {
          await withTransaction(models, (session) => releaseInventory({
            models,
            orderId: "ord_open",
            sessionCannotBePaidVerified: false,
            session,
          }));
        },
        /can no longer be paid/i,
      );

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.reserved, 2);
    });

    it("puts stock back on the shelf once the payment link is verified dead", async () => {
      const models = makeFakeModels(
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 2, consumed: 0, version: 2 }],
        [{ orderId: "ord_expired", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 2, state: "reserved" }],
      );

      const result = await withTransaction(models, (session) => releaseInventory({
        models,
        orderId: "ord_expired",
        sessionCannotBePaidVerified: true,
        session,
      }));

      assert.equal(result.releasedCount, 1);

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 10);
      assert.equal(counter.reserved, 0);

      const res = models.InventoryReservation._getReservations()[0];
      assert.equal(res.state, "released");
    });

    it("releases a hold once when the same order is released twice at the same time", async () => {
      const models = makeFakeModels(
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 2, consumed: 0, version: 2 }],
        [
          { orderId: "ord_a", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 1, state: "reserved" },
          { orderId: "ord_b", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 1, state: "reserved" },
        ],
      );
      const session = { id: "test-transaction" };

      const [first, second] = await Promise.all([
        releaseInventory({ models, orderId: "ord_a", sessionCannotBePaidVerified: true, session }),
        releaseInventory({ models, orderId: "ord_a", sessionCannotBePaidVerified: true, session }),
      ]);

      assert.equal(first.releasedCount + second.releasedCount, 1);

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 9); // One unit back, not two
      assert.equal(counter.reserved, 1); // The other order's unit is still held
    });

    it("refuses to release reservation if counter conditional update fails", async () => {
      const models = makeFakeModels(
        // reserved is below the hold quantity, so the fence must fail
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 0, consumed: 2, version: 2 }],
        [{ orderId: "ord_lost_fence_rel", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 2, state: "reserved" }],
      );

      await assert.rejects(
        async () => {
          await withTransaction(models, (session) => releaseInventory({
            models,
            orderId: "ord_lost_fence_rel",
            sessionCannotBePaidVerified: true,
            session,
          }));
        },
        /counter fence lost/i,
      );

      const res = models.InventoryReservation._getReservations()[0];
      assert.equal(res.state, "reserved");
    });
  });

  describe("transaction requirement", () => {
    const cases = [
      ["holdInventory", (models) => holdInventory({
        models,
        orderId: "ord_no_tx",
        items: [{ skuKey: "info-hoodie-purple-m", quantity: 1 }],
        catalog: sampleCatalog,
      })],
      ["consumeInventory", (models) => consumeInventory({ models, orderId: "ord_no_tx" })],
      ["releaseInventory", (models) => releaseInventory({
        models,
        orderId: "ord_no_tx",
        sessionCannotBePaidVerified: true,
      })],
    ];

    for (const [name, call] of cases) {
      it(`refuses to run ${name} outside a transaction`, async () => {
        const models = makeFakeModels(
          [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 5, reserved: 1, consumed: 0, version: 1 }],
          [{ orderId: "ord_no_tx", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 1, state: "reserved" }],
        );

        await assert.rejects(() => call(models), /must run inside a database transaction/i);

        const counter = models.InventoryCounter._getCounters()[0];
        assert.equal(counter.available, 5);
        assert.equal(counter.reserved, 1);
        assert.equal(models.InventoryReservation._getReservations()[0].state, "reserved");
      });
    }
  });
});
