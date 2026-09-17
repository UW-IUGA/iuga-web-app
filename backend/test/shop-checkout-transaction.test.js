/*
 * @behavior Prove that the checkout transaction really wraps every write. The doubles elsewhere in
 *           this suite cannot show that: only the installed Mongoose decides how `create` reads its
 *           arguments and whether a session reaches a save.
 *
 *           No database runs here, so the insert itself is the one thing replaced. Argument shape,
 *           session plumbing, and schema validation are the installed Mongoose and the real
 *           schemas doing their actual work.
 */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import mongoose from "mongoose";

import {
  checkoutAttemptSchema,
  inventoryReservationSchema,
  orderSchema,
} from "../schemas/schemas.js";
import { persistNewCheckout } from "../shop/checkout/persistence.js";

const Order = mongoose.models.Order ?? mongoose.model("Order", orderSchema);
const CheckoutAttempt = mongoose.models.CheckoutAttempt ?? mongoose.model("CheckoutAttempt", checkoutAttemptSchema);
const InventoryReservation = mongoose.models.InventoryReservation ?? mongoose.model("InventoryReservation", inventoryReservationSchema);

const NOW = new Date("2026-10-01T12:00:00.000Z");
// Deliberately not the one-hour default: a hold that repeats a literal instead of reading the
// prepared attempt fails the window test below.
const ATTEMPT_WINDOW_MS = 45 * 60 * 1000;
const SESSION = { id: "tx-checkout" };

const CATALOG_ROWS = [
  { skuKey: "info-hoodie", fulfillmentSku: "HOODIE-PURPLE-M", inventoryPolicy: "finite", unitAmountCents: 6500 },
  { skuKey: "info-tote", fulfillmentSku: "TOTE-NATURAL", inventoryPolicy: "finite", unitAmountCents: 2000 },
];

// Only what the hold path asks of a counter, and loud about anything else, so this double cannot
// quietly accept a query production would never run.
function makeCounterDouble(piles) {
  return {
    async findOneAndUpdate(filter, update) {
      const unexpected = Object.keys(filter).filter((key) => key !== "fulfillmentSku" && key !== "available");
      if (unexpected.length > 0) {
        throw new Error(`Counter double does not implement filter key(s): ${unexpected.join(", ")}`);
      }

      const pile = piles[filter.fulfillmentSku];
      if (!pile) return null;
      if (filter.available?.$gte !== undefined && pile.available < filter.available.$gte) return null;

      for (const [key, value] of Object.entries(update.$inc)) {
        pile[key] = (pile[key] || 0) + value;
      }
      return { ...pile };
    },
  };
}

function makePiles() {
  return {
    "HOODIE-PURPLE-M": { fulfillmentSku: "HOODIE-PURPLE-M", available: 5, reserved: 0, consumed: 0, version: 1 },
    "TOTE-NATURAL": { fulfillmentSku: "TOTE-NATURAL", available: 5, reserved: 0, consumed: 0, version: 1 },
  };
}

// Record what the real document writes are told, instead of inserting. Validation is the real
// schema's, so an unusable document fails here rather than passing silently.
function recordSaves(Model) {
  const writes = [];
  const original = Model.prototype.$save;

  Model.prototype.$save = async function record(options = {}) {
    await this.validate();
    writes.push({ session: options.session ?? null, document: this.toObject() });
    return this;
  };

  return {
    writes,
    restore() {
      Model.prototype.$save = original;
    },
  };
}

function makeCheckout({ items }) {
  // The coordinator mints these as 24-character hex strings, not ObjectIds.
  const orderId = randomUUID().replaceAll("-", "").slice(0, 24);
  const attemptId = randomUUID().replaceAll("-", "").slice(0, 24);
  const owner = { type: "user", userId: "user-1" };
  const expiresAt = new Date(NOW.getTime() + ATTEMPT_WINDOW_MS);
  const orderItems = items.map((item) => {
    const row = CATALOG_ROWS.find((candidate) => candidate.skuKey === item.skuKey);
    return {
      skuKey: item.skuKey,
      title: item.skuKey,
      variant: null,
      quantity: item.quantity,
      unitAmountCents: row.unitAmountCents,
      subtotalCents: row.unitAmountCents * item.quantity,
    };
  });
  const totalCents = orderItems.reduce((sum, item) => sum + item.subtotalCents, 0);
  const quoteSnapshot = { currency: "usd", totalCents };

  return {
    cart: items,
    catalogRows: CATALOG_ROWS,
    orderDocument: {
      _id: orderId,
      owner,
      orderReference: `ORD-${orderId}`,
      items: orderItems,
      totalCents,
      quoteSnapshot,
      paymentState: "pending",
      fulfillmentState: "pending",
      refundState: "none",
    },
    attemptDocument: {
      _id: attemptId,
      owner,
      attemptKey: "9f1c0f2e-8f0a-4b3d-9a2e-6c5d1f4b7a80",
      providerIdempotencyKey: `iuga:checkout:${attemptId}`,
      attemptCart: JSON.stringify(items),
      items,
      catalogVersion: "2026-10-01.1",
      dropKey: "drop-fall",
      quoteSnapshot,
      frozenStripeRequest: {
        lineItems: items.map((item) => ({ priceId: `price_${item.skuKey}`, quantity: item.quantity })),
        successUrl: "https://shop.test/shop/checkout/success",
        cancelUrl: "https://shop.test/shop/checkout/cancel",
        expiresAt: Math.floor(expiresAt.getTime() / 1000),
        clientReferenceId: String(orderId),
        metadata: { attempt: String(attemptId), order: String(orderId) },
      },
      expiresAt,
      firstSubmissionAt: NOW,
      status: "pending",
      orderId: String(orderId),
      sessionId: null,
      paymentIntentId: null,
    },
  };
}

// Record every write the checkout makes, and hand back one way to undo the recording.
function recordWrites(models) {
  const recorders = Object.fromEntries(
    Object.entries(models).map(([name, Model]) => [name, recordSaves(Model)]),
  );

  return {
    writes(name) {
      return recorders[name].writes;
    },
    restore() {
      for (const recorder of Object.values(recorders)) recorder.restore();
    },
  };
}

const transaction = async (work) => work(SESSION);
const REAL_MODELS = { Order, CheckoutAttempt, InventoryReservation };

describe("checkout persistence against the real models", () => {
  it("writes the order and the attempt inside the caller's transaction", async () => {
    const recordings = recordWrites(REAL_MODELS);

    try {
      const checkout = makeCheckout({ items: [{ skuKey: "info-hoodie", quantity: 1 }] });

      const result = await persistNewCheckout({
        models: { ...REAL_MODELS, InventoryCounter: makeCounterDouble(makePiles()) },
        checkout,
        transaction,
      });

      assert.deepEqual(result, { ok: true });
      // Exactly one write each, and both carry the transaction's session. Called with a bare
      // document, Mongoose reads `{ session }` as a second document and saves it instead.
      assert.equal(recordings.writes("Order").length, 1);
      assert.equal(recordings.writes("Order")[0].session, SESSION);
      assert.equal(recordings.writes("CheckoutAttempt").length, 1);
      assert.equal(recordings.writes("CheckoutAttempt")[0].session, SESSION);
    } finally {
      recordings.restore();
    }
  });

  it("holds stock for exactly as long as the attempt's payment link lasts", async () => {
    const recordings = recordWrites(REAL_MODELS);

    try {
      const checkout = makeCheckout({ items: [{ skuKey: "info-hoodie", quantity: 1 }] });

      const result = await persistNewCheckout({
        models: { ...REAL_MODELS, InventoryCounter: makeCounterDouble(makePiles()) },
        checkout,
        transaction,
      });

      assert.deepEqual(result, { ok: true });

      const reservationWrites = recordings.writes("InventoryReservation");
      assert.equal(reservationWrites.length, 1);
      assert.equal(reservationWrites[0].session, SESSION);
      assert.deepEqual(reservationWrites[0].document.expiresAt, checkout.attemptDocument.expiresAt);
      assert.deepEqual(reservationWrites[0].document.createdAt, checkout.attemptDocument.firstSubmissionAt);
    } finally {
      recordings.restore();
    }
  });

  it("writes one reservation per variant in a single ordered create", async () => {
    const recordings = recordWrites(REAL_MODELS);

    try {
      const checkout = makeCheckout({
        items: [
          { skuKey: "info-hoodie", quantity: 1 },
          { skuKey: "info-tote", quantity: 2 },
        ],
      });

      const result = await persistNewCheckout({
        models: { ...REAL_MODELS, InventoryCounter: makeCounterDouble(makePiles()) },
        checkout,
        transaction,
      });

      // Mongoose refuses a session with several documents unless they are ordered, so a
      // multi-variant cart is the case that proves the array and options contract holds.
      assert.deepEqual(result, { ok: true });
      assert.deepEqual(
        recordings.writes("InventoryReservation").map((write) => write.session),
        [SESSION, SESSION],
      );
    } finally {
      recordings.restore();
    }
  });
});
