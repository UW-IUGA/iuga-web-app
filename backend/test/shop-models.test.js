import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";

import {
  catalogEntrySchema,
  shopDropSchema,
  inventoryCounterSchema,
  inventoryReservationSchema,
  checkoutAttemptSchema,
  orderSchema,
  refundOperationSchema,
  disputeSchema,
  stripeInboxEventSchema,
  orderActivitySchema,
} from "../schemas/schemas.js";
import { models } from "../models.js";
import {
  applyDisputeEvent,
  applyFulfillmentAction,
  applyPaymentEvent,
  applyRefundEvent,
} from "../shop/domain.js";

describe("Shop Mongoose Schemas and Models", () => {
  describe("Schema exports and model registry", () => {
    it("exports all commerce schemas from schemas package", () => {
      assert.ok(catalogEntrySchema instanceof mongoose.Schema);
      assert.ok(shopDropSchema instanceof mongoose.Schema);
      assert.ok(inventoryCounterSchema instanceof mongoose.Schema);
      assert.ok(inventoryReservationSchema instanceof mongoose.Schema);
      assert.ok(checkoutAttemptSchema instanceof mongoose.Schema);
      assert.ok(orderSchema instanceof mongoose.Schema);
      assert.ok(refundOperationSchema instanceof mongoose.Schema);
      assert.ok(disputeSchema instanceof mongoose.Schema);
      assert.ok(stripeInboxEventSchema instanceof mongoose.Schema);
      assert.ok(orderActivitySchema instanceof mongoose.Schema);
    });
  });

  describe("CatalogEntry schema and indexes", () => {
    it("defines compound unique index on { skuKey, dropKey, catalogVersion }", () => {
      const indexes = catalogEntrySchema.indexes();
      const compound = indexes.find(([fields, opts]) =>
        fields.skuKey === 1 && fields.dropKey === 1 && fields.catalogVersion === 1 && opts?.unique === true,
      );
      assert.ok(compound, "Missing compound unique index on skuKey, dropKey, catalogVersion");
    });

    it("validates required fields and enums", () => {
      const CatalogEntry = mongoose.model("CatalogEntryTest", catalogEntrySchema);
      const invalid = new CatalogEntry({});
      const err = invalid.validateSync();
      assert.ok(err.errors.skuKey);
      assert.ok(err.errors.dropKey);
      assert.ok(err.errors.catalogVersion);
      assert.ok(err.errors.title);
      assert.ok(err.errors.unitAmountMinor);

      const valid = new CatalogEntry({
        skuKey: "info-hoodie-purple-m",
        catalogVersion: "v1-2026-10",
        dropKey: "drop-fall-2026",
        productKey: "info-hoodie",
        title: "IUGA Info Hoodie",
        fulfillmentSku: "HOODIE-PURPLE-M",
        unitAmountMinor: 4500,
        inventoryPolicy: "finite",
      });
      assert.equal(valid.validateSync(), undefined);
      assert.equal(valid.currency, "usd");
    });
    it("rejects non-safe integer or negative unitAmountMinor", () => {
      const CatalogEntry = mongoose.model("CatalogEntryValidatorTest", catalogEntrySchema);
      const floatEntry = new CatalogEntry({
        skuKey: "hoodie-float",
        catalogVersion: "v1",
        dropKey: "drop-1",
        productKey: "hoodie",
        title: "Hoodie",
        fulfillmentSku: "H-M",
        unitAmountMinor: 45.5,
      });
      assert.ok(floatEntry.validateSync()?.errors?.unitAmountMinor);

      const negEntry = new CatalogEntry({
        skuKey: "hoodie-neg",
        catalogVersion: "v1",
        dropKey: "drop-1",
        productKey: "hoodie",
        title: "Hoodie",
        fulfillmentSku: "H-M",
        unitAmountMinor: -100,
      });
      assert.ok(negEntry.validateSync()?.errors?.unitAmountMinor);
    });
  });

  describe("ShopDrop schema", () => {
    it("enforces unique dropKey and required UTC time boundaries", () => {
      assert.equal(shopDropSchema.paths.dropKey.options.unique, true);

      const ShopDrop = mongoose.model("ShopDropTest", shopDropSchema);
      const invalid = new ShopDrop({});
      const err = invalid.validateSync();
      assert.ok(err.errors.dropKey);
      assert.ok(err.errors.opensAt);
      assert.ok(err.errors.closesAt);
    });
  });

  describe("InventoryCounter and Reservation schemas", () => {
    it("enforces unique fulfillmentSku on counter", () => {
      assert.equal(inventoryCounterSchema.paths.fulfillmentSku.options.unique, true);
    });

    it("enforces unique { orderId, skuKey } on reservation", () => {
      const indexes = inventoryReservationSchema.indexes();
      const uniqueRes = indexes.find(([fields, opts]) =>
        fields.orderId === 1 && fields.skuKey === 1 && opts?.unique === true,
      );
      assert.ok(uniqueRes, "Missing unique index on orderId, skuKey");

      const queryIdx = indexes.find(([fields]) =>
        fields.skuKey === 1 && fields.state === 1 && fields.expiresAt === 1,
      );
      assert.ok(queryIdx, "Missing query index on skuKey, state, expiresAt");
    });
  });

  describe("CheckoutAttempt schema and partial unique indexes", () => {
    it("enforces unique { owner.type, owner.userId, attemptKey }", () => {
      const indexes = checkoutAttemptSchema.indexes();
      const ownerUnique = indexes.find(([fields, opts]) =>
        fields["owner.type"] === 1 && fields["owner.userId"] === 1 && fields.attemptKey === 1 && opts?.unique === true,
      );
      assert.ok(ownerUnique, "Missing unique index on owner and attemptKey");
    });

    it("enforces partial unique indexes on provider sessionId and paymentIntentId", () => {
      const indexes = checkoutAttemptSchema.indexes();

      const sessionPartial = indexes.find(([fields, opts]) =>
        fields.providerMode === 1 && fields.providerAccountId === 1 && fields.sessionId === 1
        && opts?.unique === true && opts?.partialFilterExpression?.sessionId?.$type === "string",
      );
      assert.ok(sessionPartial, "Missing partial unique index on providerMode, providerAccountId, sessionId");

      const piPartial = indexes.find(([fields, opts]) =>
        fields.providerMode === 1 && fields.providerAccountId === 1 && fields.paymentIntentId === 1
        && opts?.unique === true && opts?.partialFilterExpression?.paymentIntentId?.$type === "string",
      );
      assert.ok(piPartial, "Missing partial unique index on providerMode, providerAccountId, paymentIntentId");
    });
  });

  describe("Order schema and owner cursor index", () => {
    it("keeps the order rules to fields the order document defines", () => {
      // A rule that returns a field the document does not store loses that value silently when
      // the order is saved — how the fulfilment and payment rules once drifted.
      const defined = new Set(Object.keys(orderSchema.paths).map((path) => path.split(".")[0]));
      const samples = [
        applyPaymentEvent({ paymentState: "pending", totalMinor: 4500 }, { type: "payment_confirmed", providerPaymentId: "pi_1" }),
        applyFulfillmentAction({ fulfillmentMethod: "pickup", fulfillmentState: "preparing" }, { action: "hold", reason: "address_verification_needed" }),
        applyFulfillmentAction({ fulfillmentMethod: "shipping", fulfillmentState: "preparing" }, { action: "ship", trackingNumber: "1Z999" }),
        applyRefundEvent({ totalMinor: 4500, refundedMinor: 0, pendingRefundMinor: 0 }, { action: "reserve", amountMinor: 500 }),
        applyDisputeEvent({ dispute: { state: "none" } }, { action: "open", reason: "fraudulent" }),
      ];

      for (const sample of samples) {
        for (const key of Object.keys(sample)) {
          assert.ok(defined.has(key), `order rule returned a field the order document cannot store: ${key}`);
        }
      }
    });

    it("stores the fulfilment details the order rules produce", () => {
      for (const path of [
        "fulfillmentHold.reason",
        "fulfillmentHold.placedAt",
        "fulfillmentHold.returnToState",
        "trackingNumber",
      ]) {
        assert.ok(orderSchema.paths[path], `Missing order path ${path}`);
      }
    });

    it("enforces unique orderReference", () => {
      assert.equal(orderSchema.paths.orderReference.options.unique, true);
    });

    it("enforces compound cursor history index { owner.type, owner.userId, createdAt: -1, _id: -1 }", () => {
      const indexes = orderSchema.indexes();
      const cursorIdx = indexes.find(([fields]) =>
        fields["owner.type"] === 1 && fields["owner.userId"] === 1 && fields.createdAt === -1 && fields._id === -1,
      );
      assert.ok(cursorIdx, "Missing cursor history index on owner, createdAt desc, _id desc");
    });
  });

  describe("RefundOperation and Dispute partial provider indexes", () => {
    it("enforces partial unique providerRefundId index on refund operations", () => {
      const indexes = refundOperationSchema.indexes();
      const refundPartial = indexes.find(([fields, opts]) =>
        fields.providerAccountId === 1 && fields.providerMode === 1 && fields.providerRefundId === 1
        && opts?.unique === true && opts?.partialFilterExpression?.providerRefundId?.$type === "string",
      );
      assert.ok(refundPartial, "Missing partial unique index for providerRefundId");
      assert.equal(refundOperationSchema.paths.commandId.options.unique, true);
    });

    it("enforces partial unique providerDisputeId index on disputes", () => {
      const indexes = disputeSchema.indexes();
      const disputePartial = indexes.find(([fields, opts]) =>
        fields.providerAccountId === 1 && fields.providerMode === 1 && fields.providerDisputeId === 1
        && opts?.unique === true && opts?.partialFilterExpression?.providerDisputeId?.$type === "string",
      );
      assert.ok(disputePartial, "Missing partial unique index for providerDisputeId");
    });
  });

  describe("StripeInboxEvent schema", () => {
    it("enforces unique { accountId, livemode, eventId }", () => {
      const indexes = stripeInboxEventSchema.indexes();
      const inboxUnique = indexes.find(([fields, opts]) =>
        fields.accountId === 1 && fields.livemode === 1 && fields.eventId === 1 && opts?.unique === true,
      );
      assert.ok(inboxUnique, "Missing unique index on accountId, livemode, eventId");
    });
  });
});
