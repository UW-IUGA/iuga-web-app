/*
Purpose: Pin the shop's rules: what a cart may contain, when a sale window is open, how prices
         are locked in, and how an order may move through payment, fulfilment, refund, and
         dispute. These run without a database, because these rules do not need one.
*/

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeCart,
  isSalesWindowOpen,
  snapshotQuote,
  applyPaymentEvent,
  applyFulfillmentAction,
  applyRefundEvent,
  applyDisputeEvent,
} from "../shop/domain.js";

describe("Shop Domain - Pure Contracts and Reducers", () => {
  describe("normalizeCart", () => {
    it("sorts and validates a standard cart with multiple SKUs", () => {
      const input = [
        { skuKey: "info-tote-bag-natural", quantity: 2 },
        { skuKey: "info-hoodie-purple-l", quantity: 1 },
      ];

      const normalized = normalizeCart(input);

      assert.deepEqual(normalized, [
        { skuKey: "info-hoodie-purple-l", quantity: 1 },
        { skuKey: "info-tote-bag-natural", quantity: 2 },
      ]);
      assert.ok(Object.isFrozen(normalized));
      assert.ok(Object.isFrozen(normalized[0]));
    });

    it("rejects non-array or empty cart inputs", () => {
      assert.throws(() => normalizeCart(null), /empty/i);
      assert.throws(() => normalizeCart([]), /empty/i);
      assert.throws(() => normalizeCart("not-an-array"), /array/i);
    });

    it("hard-rejects carts containing duplicate SKU keys", () => {
      const duplicateInput = [
        { skuKey: "info-hoodie-purple-m", quantity: 1 },
        { skuKey: "info-hoodie-purple-m", quantity: 2 },
      ];

      assert.throws(
        () => normalizeCart(duplicateInput),
        /duplicate/i,
      );
    });

    it("rejects non-integer, zero, negative, or unsafe quantities", () => {
      assert.throws(
        () => normalizeCart([{ skuKey: "hoodie", quantity: 0 }]),
        /positive safe integer/i,
      );
      assert.throws(
        () => normalizeCart([{ skuKey: "hoodie", quantity: -1 }]),
        /positive safe integer/i,
      );
      assert.throws(
        () => normalizeCart([{ skuKey: "hoodie", quantity: 1.5 }]),
        /positive safe integer/i,
      );
      assert.throws(
        () => normalizeCart([{ skuKey: "hoodie", quantity: "1" }]),
        /positive safe integer/i,
      );
      assert.throws(
        () => normalizeCart([{ skuKey: "hoodie", quantity: Number.MAX_SAFE_INTEGER + 1 }]),
        /positive safe integer/i,
      );
    });

    it("rejects invalid or empty SKU strings", () => {
      assert.throws(() => normalizeCart([{ skuKey: "", quantity: 1 }]), /sku/i);
      assert.throws(() => normalizeCart([{ skuKey: "   ", quantity: 1 }]), /sku/i);
      assert.throws(() => normalizeCart([{ quantity: 1 }]), /sku/i);
    });
  });

  describe("isSalesWindowOpen", () => {
    const drop = Object.freeze({
      dropKey: "drop-fall-2026",
      opensAt: new Date("2026-10-01T00:00:00.000Z"),
      closesAt: new Date("2026-10-15T00:00:00.000Z"),
      isEnabled: true,
    });

    it("returns true when current time is strictly within window and drop is enabled", () => {
      const within = new Date("2026-10-05T12:00:00.000Z");
      assert.equal(isSalesWindowOpen(drop, within), true);
    });

    it("returns true at exact opensAt boundary, false at exact closesAt boundary", () => {
      assert.equal(isSalesWindowOpen(drop, drop.opensAt), true);
      assert.equal(isSalesWindowOpen(drop, drop.closesAt), false);
    });

    it("returns false before opensAt or after closesAt", () => {
      assert.equal(isSalesWindowOpen(drop, new Date("2026-09-30T23:59:59.999Z")), false);
      assert.equal(isSalesWindowOpen(drop, new Date("2026-10-15T00:00:00.001Z")), false);
    });

    it("returns false when drop is disabled regardless of dates", () => {
      const disabledDrop = { ...drop, isEnabled: false };
      assert.equal(isSalesWindowOpen(disabledDrop, new Date("2026-10-05T12:00:00.000Z")), false);
    });

    it("parses ISO strings correctly into UTC timestamps", () => {
      const stringDrop = {
        dropKey: "drop-iso",
        opensAt: "2026-10-01T00:00:00.000Z",
        closesAt: "2026-10-15T00:00:00.000Z",
        isEnabled: true,
      };
      assert.equal(isSalesWindowOpen(stringDrop, new Date("2026-10-05T12:00:00.000Z")), true);
    });
  });

  describe("snapshotQuote", () => {
    const activeDrop = Object.freeze({
      dropKey: "drop-fall-2026",
      catalogVersion: "v1-2026-10",
      opensAt: new Date("2026-10-01T00:00:00.000Z"),
      closesAt: new Date("2026-10-15T00:00:00.000Z"),
      isEnabled: true,
    });

    const catalog = Object.freeze([
      {
        skuKey: "info-hoodie-purple-l",
        dropKey: "drop-fall-2026",
        title: "IUGA Info Hoodie",
        variant: "Purple / L",
        unitAmountMinor: 4500,
        currency: "usd",
        isAvailable: true,
      },
      {
        skuKey: "info-tote-bag-natural",
        dropKey: "drop-fall-2026",
        title: "IUGA Canvas Tote Bag",
        variant: "Natural",
        unitAmountMinor: 1500,
        currency: "usd",
        isAvailable: true,
      },
    ]);

    it("freezes an immutable quote with exact safe integer cents totals", () => {
      const cart = [
        { skuKey: "info-hoodie-purple-l", quantity: 2 },
        { skuKey: "info-tote-bag-natural", quantity: 1 },
      ];
      const now = new Date("2026-10-02T10:00:00.000Z");

      const quote = snapshotQuote({ cart, catalog, drop: activeDrop, now });

      assert.equal(quote.dropKey, "drop-fall-2026");
      assert.equal(quote.catalogVersion, "v1-2026-10");
      assert.equal(quote.currency, "usd");
      assert.equal(quote.totalMinor, 10500); // (2 * 4500) + (1 * 1500) = 9000 + 1500 = 10500
      assert.equal(quote.items.length, 2);
      assert.deepEqual(quote.items[0], {
        skuKey: "info-hoodie-purple-l",
        title: "IUGA Info Hoodie",
        variant: "Purple / L",
        quantity: 2,
        unitAmountMinor: 4500,
        subtotalMinor: 9000,
      });
      assert.ok(Object.isFrozen(quote));
      assert.ok(Object.isFrozen(quote.items));
      assert.ok(Object.isFrozen(quote.items[0]));
    });

    it("rejects quotes when the drop is not active", () => {
      const cart = [{ skuKey: "info-hoodie-purple-l", quantity: 1 }];
      const closedTime = new Date("2026-11-01T00:00:00.000Z");

      assert.throws(
        () => snapshotQuote({ cart, catalog, drop: activeDrop, now: closedTime }),
        /inactive drop/i,
      );
    });

    it("rejects quotes if a SKU is missing from the catalog or drop does not match", () => {
      const cart = [{ skuKey: "unknown-sku", quantity: 1 }];
      const now = new Date("2026-10-02T10:00:00.000Z");

      assert.throws(
        () => snapshotQuote({ cart, catalog, drop: activeDrop, now }),
        /catalog/i,
      );
    });

    it("rejects quotes if an item is not available in catalog", () => {
      const unavailableCatalog = [
        {
          ...catalog[0],
          isAvailable: false,
        },
      ];
      const cart = [{ skuKey: "info-hoodie-purple-l", quantity: 1 }];
      const now = new Date("2026-10-02T10:00:00.000Z");

      assert.throws(
        () => snapshotQuote({ cart, catalog: unavailableCatalog, drop: activeDrop, now }),
        /unavailable/i,
      );
    });
  });

  describe("applyPaymentEvent", () => {
    it("transitions pending to paid upon verified provider payment event", () => {
      const order = {
        orderId: "ord_101",
        paymentState: "pending",
        totalMinor: 4500,
        paidAt: null,
      };

      const paidAt = new Date("2026-10-02T12:00:00.000Z");
      const updated = applyPaymentEvent(order, {
        type: "payment_confirmed",
        paidAt,
        providerPaymentId: "pi_12345",
      });

      assert.equal(updated.paymentState, "paid");
      assert.deepEqual(updated.paidAt, paidAt);
    });

    it("is idempotent when receiving duplicate payment confirmation", () => {
      const paidAt = new Date("2026-10-02T12:00:00.000Z");
      const paidOrder = {
        orderId: "ord_101",
        paymentState: "paid",
        totalMinor: 4500,
        paidAt,
      };

      const updated = applyPaymentEvent(paidOrder, {
        type: "payment_confirmed",
        paidAt: new Date("2026-10-02T12:05:00.000Z"),
      });

      assert.equal(updated.paymentState, "paid");
      assert.deepEqual(updated.paidAt, paidAt); // Retains original paidAt
    });

    it("refuses to regress a paid order back to pending", () => {
      const paidOrder = {
        orderId: "ord_101",
        paymentState: "paid",
        totalMinor: 4500,
        paidAt: new Date(),
      };

      assert.throws(
        () => applyPaymentEvent(paidOrder, { type: "reset_to_pending" }),
        /cannot regress paid state/i,
      );
    });
  });

  describe("applyFulfillmentAction", () => {
    it("handles pickup fulfillment lifecycle from pending to picked_up", () => {
      let order = {
        orderId: "ord_101",
        fulfillmentMethod: "pickup",
        fulfillmentState: "pending",
      };

      order = applyFulfillmentAction(order, { action: "prepare" });
      assert.equal(order.fulfillmentState, "preparing");

      order = applyFulfillmentAction(order, { action: "mark_ready" });
      assert.equal(order.fulfillmentState, "ready_for_pickup");

      order = applyFulfillmentAction(order, { action: "complete_pickup" });
      assert.equal(order.fulfillmentState, "picked_up");
    });

    it("follows the shipping steps for an order stored as shipping", () => {
      let order = {
        orderId: "ord_102",
        fulfillmentMethod: "shipping",
        fulfillmentState: "pending",
      };

      order = applyFulfillmentAction(order, { action: "prepare" });
      assert.equal(order.fulfillmentState, "preparing");

      order = applyFulfillmentAction(order, {
        action: "ship",
        trackingNumber: "1Z999",
      });
      assert.equal(order.fulfillmentState, "shipped");

      order = applyFulfillmentAction(order, { action: "deliver" });
      assert.equal(order.fulfillmentState, "delivered");
    });

    it("refuses a shipping step on an order the buyer collects", () => {
      const order = {
        orderId: "ord_105",
        fulfillmentMethod: "pickup",
        fulfillmentState: "preparing",
      };

      assert.throws(
        () => applyFulfillmentAction(order, { action: "ship" }),
        /illegal fulfillment transition/i,
      );
    });

    it("supports hold and unhold transitions without losing previous progress", () => {
      let order = {
        orderId: "ord_103",
        fulfillmentMethod: "pickup",
        fulfillmentState: "preparing",
        holdReason: null,
      };

      order = applyFulfillmentAction(order, {
        action: "hold",
        reason: "address_verification_needed",
      });
      assert.equal(order.fulfillmentState, "on_hold");
      assert.equal(order.holdReason, "address_verification_needed");

      order = applyFulfillmentAction(order, { action: "release_hold" });
      assert.equal(order.fulfillmentState, "preparing");
      assert.equal(order.holdReason, null);
    });

    it("rejects illegal transitions", () => {
      const order = {
        orderId: "ord_104",
        fulfillmentMethod: "pickup",
        fulfillmentState: "picked_up",
      };

      assert.throws(
        () => applyFulfillmentAction(order, { action: "prepare" }),
        /illegal fulfillment transition/i,
      );
    });
  });

  describe("applyRefundEvent", () => {
    it("reserves and settles refunds within the collected payment budget", () => {
      let order = {
        orderId: "ord_201",
        totalMinor: 10000,
        refundedMinor: 0,
        pendingRefundMinor: 0,
        refundState: "none",
        paymentState: "paid",
      };

      // 1. Reserve partial refund of 3000 cents
      order = applyRefundEvent(order, {
        action: "reserve",
        amountMinor: 3000,
      });
      assert.equal(order.pendingRefundMinor, 3000);
      assert.equal(order.refundedMinor, 0);
      assert.equal(order.refundState, "none");
      assert.equal(order.paymentState, "paid"); // Preserves payment truth

      // 2. Settle the 3000 cents refund
      order = applyRefundEvent(order, {
        action: "settle",
        amountMinor: 3000,
      });
      assert.equal(order.pendingRefundMinor, 0);
      assert.equal(order.refundedMinor, 3000);
      assert.equal(order.refundState, "partial");
      assert.equal(order.paymentState, "paid");

      // 3. Reserve and settle remaining 7000 cents
      order = applyRefundEvent(order, {
        action: "reserve",
        amountMinor: 7000,
      });
      order = applyRefundEvent(order, {
        action: "settle",
        amountMinor: 7000,
      });
      assert.equal(order.pendingRefundMinor, 0);
      assert.equal(order.refundedMinor, 10000);
      assert.equal(order.refundState, "full");
      assert.equal(order.paymentState, "paid");
    });

    it("releases pending refund on failure without altering settled refunds", () => {
      let order = {
        orderId: "ord_202",
        totalMinor: 5000,
        refundedMinor: 1000,
        pendingRefundMinor: 0,
        refundState: "partial",
        paymentState: "paid",
      };

      order = applyRefundEvent(order, {
        action: "reserve",
        amountMinor: 2000,
      });
      assert.equal(order.pendingRefundMinor, 2000);

      order = applyRefundEvent(order, {
        action: "fail",
        amountMinor: 2000,
      });
      assert.equal(order.pendingRefundMinor, 0);
      assert.equal(order.refundedMinor, 1000);
      assert.equal(order.refundState, "partial");
    });

    it("rejects refund reservations that exceed the available payment balance", () => {
      const order = {
        orderId: "ord_203",
        totalMinor: 5000,
        refundedMinor: 3000,
        pendingRefundMinor: 1500,
        refundState: "partial",
        paymentState: "paid",
      };

      // Only 500 cents remaining available, requesting 1000 must throw
      assert.throws(
        () => applyRefundEvent(order, { action: "reserve", amountMinor: 1000 }),
        /refund budget exceeded/i,
      );
    });
  });

  describe("applyDisputeEvent", () => {
    it("tracks dispute lifecycle from none to open to won or lost", () => {
      let order = {
        orderId: "ord_301",
        totalMinor: 4500,
        paymentState: "paid",
        dispute: {
          state: "none",
          reason: null,
          evidenceDueBy: null,
        },
      };

      // Open dispute
      const dueBy = new Date("2026-11-01T00:00:00.000Z");
      order = applyDisputeEvent(order, {
        action: "open",
        reason: "fraudulent",
        evidenceDueBy: dueBy,
      });
      assert.equal(order.dispute.state, "open");
      assert.equal(order.dispute.reason, "fraudulent");
      assert.deepEqual(order.dispute.evidenceDueBy, dueBy);
      assert.equal(order.paymentState, "paid"); // Does not rewrite paymentState

      // Resolve dispute
      order = applyDisputeEvent(order, { action: "resolve", outcome: "won" });
      assert.equal(order.dispute.state, "won");
    });

    it("rejects resolving a dispute that is not open", () => {
      const order = {
        orderId: "ord_302",
        dispute: { state: "none" },
      };

      assert.throws(
        () => applyDisputeEvent(order, { action: "resolve", outcome: "won" }),
        /dispute not open/i,
      );
    });
  });
});
