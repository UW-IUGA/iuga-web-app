/*
Purpose: Pin the stock promises: the last hoodie cannot be sold twice, a half-finished order
         gives its stock back, and stock only returns to the shelf once the payment link can no
         longer be paid.
*/

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  holdInventory,
  consumeInventory,
  releaseInventory,
  InsufficientInventoryError,
} from "../shop/reservations.js";

function makeFakeModels(initialCounters = [], initialReservations = []) {
  const counters = new Map(initialCounters.map((c) => [c.fulfillmentSku, { ...c }]));
  const reservations = [...initialReservations.map((r) => ({ ...r }))];

  return {
    InventoryCounter: {
      async findOneAndUpdate(filter, update, options = {}) {
        const doc = counters.get(filter.fulfillmentSku);
        if (!doc) return null;

        if (filter.available && filter.available.$gte !== undefined) {
          if (doc.available < filter.available.$gte) {
            return null;
          }
        }
        if (filter.reserved && filter.reserved.$gte !== undefined) {
          if (doc.reserved < filter.reserved.$gte) {
            return null;
          }
        }

        if (update.$inc) {
          for (const [key, val] of Object.entries(update.$inc)) {
            doc[key] = (doc[key] || 0) + val;
          }
        }

        return { ...doc };
      },
      _getCounters() {
        return Array.from(counters.values());
      },
    },
    InventoryReservation: {
      async create(docs, options = {}) {
        const toAdd = Array.isArray(docs) ? docs : [docs];
        for (const doc of toAdd) {
          reservations.push({ ...doc });
        }
        return toAdd;
      },
      async find(filter = {}) {
        return reservations.filter((r) => {
          if (filter.orderId && r.orderId !== filter.orderId) return false;
          if (filter.state && r.state !== filter.state) return false;
          return true;
        });
      },
      async updateMany(filter, update, options = {}) {
        let count = 0;
        for (const r of reservations) {
          if (filter.orderId && r.orderId !== filter.orderId) continue;
          if (filter.state && r.state !== filter.state) continue;
          if (update.$set) {
            Object.assign(r, update.$set);
          }
          count++;
        }
        return { modifiedCount: count };
      },
      _getReservations() {
        return reservations;
      },
    },
  };
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

      const reservations = await holdInventory({
        models,
        orderId: "ord_1",
        items,
        catalog: sampleCatalog,
        now,
        ttlMs: 15 * 60 * 1000,
      });

      assert.equal(reservations.length, 1);
      assert.equal(reservations[0].skuKey, "info-hoodie-purple-m");
      assert.equal(reservations[0].quantity, 2);
      assert.equal(reservations[0].state, "reserved");
      assert.deepEqual(reservations[0].expiresAt, new Date("2026-10-01T12:15:00.000Z"));

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 8);
      assert.equal(counter.reserved, 2);
    });

    it("skips inventory deduction for preorder items", async () => {
      const models = makeFakeModels([
        { fulfillmentSku: "STICKER-PACK", available: 0, reserved: 0, consumed: 0, version: 1 },
      ]);

      const items = [{ skuKey: "info-sticker-pack", quantity: 5 }];
      const reservations = await holdInventory({
        models,
        orderId: "ord_preorder",
        items,
        catalog: sampleCatalog,
      });

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
          await holdInventory({
            models,
            orderId: "ord_fail",
            items,
            catalog: sampleCatalog,
          });
        },
        (err) => {
          assert.ok(err instanceof InsufficientInventoryError);
          assert.equal(err.skuKey, "info-hoodie-purple-m");
          return true;
        },
      );

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 1); // Unchanged, never underflowed
      assert.equal(counter.reserved, 0);
    });

    it("rolls back partial holds if subsequent item in cart is out of stock", async () => {
      const models = makeFakeModels([
        { fulfillmentSku: "HOODIE-PURPLE-M", available: 5, reserved: 0, consumed: 0, version: 1 },
        { fulfillmentSku: "TOTE-NATURAL", available: 0, reserved: 0, consumed: 0, version: 1 },
      ]);

      const items = [
        { skuKey: "info-hoodie-purple-m", quantity: 2 },
        { skuKey: "info-tote-bag-natural", quantity: 1 }, // Will fail
      ];

      await assert.rejects(
        async () => {
          await holdInventory({
            models,
            orderId: "ord_multi_fail",
            items,
            catalog: sampleCatalog,
          });
        },
        InsufficientInventoryError,
      );

      // Hoodie stock must be rolled back
      const hoodie = models.InventoryCounter._getCounters().find((c) => c.fulfillmentSku === "HOODIE-PURPLE-M");
      assert.equal(hoodie.available, 5);
      assert.equal(hoodie.reserved, 0);
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
          await holdInventory({
            models,
            orderId: "ord_insert_fail",
            items,
            catalog: sampleCatalog,
          });
        },
        /Simulated database write failure/,
      );

      const hoodie = models.InventoryCounter._getCounters().find((c) => c.fulfillmentSku === "HOODIE-PURPLE-M");
      assert.equal(hoodie.available, 5); // Counter compensated!
      assert.equal(hoodie.reserved, 0);
    });
  });

  describe("consumeInventory", () => {
    it("transitions reserved stock to consumed upon verified payment", async () => {
      const models = makeFakeModels(
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 2, consumed: 0, version: 2 }],
        [{ orderId: "ord_paid", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 2, state: "reserved" }],
      );

      const result = await consumeInventory({
        models,
        orderId: "ord_paid",
      });

      assert.equal(result.consumedCount, 1);

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 8);
      assert.equal(counter.reserved, 0);
      assert.equal(counter.consumed, 2);

      const res = models.InventoryReservation._getReservations()[0];
      assert.equal(res.state, "consumed");
    });

    it("refuses to consume reservation if counter conditional update fails", async () => {
      const models = makeFakeModels(
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 0, consumed: 2, version: 2 }], // reserved is 0, not 2!
        [{ orderId: "ord_lost_fence", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 2, state: "reserved" }],
      );

      await assert.rejects(
        async () => {
          await consumeInventory({
            models,
            orderId: "ord_lost_fence",
          });
        },
        /counter fence lost/i,
      );

      const res = models.InventoryReservation._getReservations()[0];
      assert.equal(res.state, "reserved"); // Not marked consumed
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
          await releaseInventory({
            models,
            orderId: "ord_open",
            sessionCannotBePaidVerified: false, // Session might still be payable!
          });
        },
        /can no longer be paid/i,
      );

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.reserved, 2); // Held safely
    });

    it("puts stock back on the shelf once the payment link is verified dead", async () => {
      const models = makeFakeModels(
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 2, consumed: 0, version: 2 }],
        [{ orderId: "ord_expired", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 2, state: "reserved" }],
      );

      const result = await releaseInventory({
        models,
        orderId: "ord_expired",
        sessionCannotBePaidVerified: true,
      });

      assert.equal(result.releasedCount, 1);

      const counter = models.InventoryCounter._getCounters()[0];
      assert.equal(counter.available, 10);
      assert.equal(counter.reserved, 0);

      const res = models.InventoryReservation._getReservations()[0];
      assert.equal(res.state, "released");
    });

    it("refuses to release reservation if counter conditional update fails", async () => {
      const models = makeFakeModels(
        [{ fulfillmentSku: "HOODIE-PURPLE-M", available: 8, reserved: 0, consumed: 2, version: 2 }], // reserved is 0, not 2!
        [{ orderId: "ord_lost_fence_rel", skuKey: "info-hoodie-purple-m", fulfillmentSku: "HOODIE-PURPLE-M", quantity: 2, state: "reserved" }],
      );

      await assert.rejects(
        async () => {
          await releaseInventory({
            models,
            orderId: "ord_lost_fence_rel",
            sessionCannotBePaidVerified: true,
          });
        },
        /counter fence lost/i,
      );

      const res = models.InventoryReservation._getReservations()[0];
      assert.equal(res.state, "reserved"); // Not marked released
    });
  });
});
