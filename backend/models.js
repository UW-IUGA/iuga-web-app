/*
Purpose: Connect to MongoDB and register every Mongoose model the API uses.
Authentication/Authorization Requirements: None; this file runs at startup only.
Expected Request Information: DB_URI in the environment.
Expected Response Information: A connected Mongoose instance, every model registered on it, and the
ReceivedStripeEvent unique index built before startup is reported ready.
*/

import mongoose from "mongoose";
import {
  eventsSchema,
  participantsSchema,
  usersSchema,
  feedbackSchema,
  rolesSchema,
  roleAssignmentsSchema,
  eventRequestsSchema,
  eventReviewsSchema,
  catalogEntrySchema,
  shopDropSchema,
  inventoryCounterSchema,
  inventoryReservationSchema,
  checkoutAttemptSchema,
  orderSchema,
  refundOperationSchema,
  disputeSchema,
  receivedStripeEventSchema,
  orderActivitySchema,
  pendingWorkSchema,
  stripePaymentEvidenceSchema,
  stripeScanProgressSchema,
} from "./schemas/schemas.js";

// Preserve the Mongoose 6 unknown-filter behavior during the staged upgrade.
mongoose.set("strictQuery", true);

let models = {};

/*
 * @behavior Connect to MongoDB, register every model, and wait for the ReceivedStripeEvent unique
 *           index to exist before startup is called ready — an unwatched delivery would otherwise
 *           be stored twice during the first moments after a deploy.
 * @returns nothing; it resolves once the connection is up and that index is built
 * @exceptions throws when DB_URI is missing, the connection fails, or the index cannot be built
 */
async function connectToDatabase(){
    const db_uri = process.env.DB_URI;
    if (!db_uri) throw new Error('DB_URI is not set (set it in backend/env/.env.dev or inject via pipeline)');
    const connectionStartedAt = Date.now();
    console.log(`[startup] connecting to mongodb at ${new Date(connectionStartedAt).toISOString()}`)
    await mongoose.connect(db_uri);
    console.log(`[startup] successfully connected to mongodb after ${Date.now() - connectionStartedAt}ms`)

  models.Events = mongoose.model("Events", eventsSchema);
  models.Participants = mongoose.model("Participants", participantsSchema);
  models.Users = mongoose.model("Users", usersSchema);
  models.Feedback = mongoose.model("Feedback", feedbackSchema);
  models.Roles = mongoose.model("Roles", rolesSchema);
  models.RoleAssignments = mongoose.model("RoleAssignments", roleAssignmentsSchema);
  models.EventRequests = mongoose.model("EventRequests", eventRequestsSchema);
  models.EventReviews = mongoose.model("EventReviews", eventReviewsSchema);
  models.CatalogEntry = mongoose.model("CatalogEntry", catalogEntrySchema);
  models.ShopDrop = mongoose.model("ShopDrop", shopDropSchema);
  models.InventoryCounter = mongoose.model("InventoryCounter", inventoryCounterSchema);
  models.InventoryReservation = mongoose.model("InventoryReservation", inventoryReservationSchema);
  models.CheckoutAttempt = mongoose.model("CheckoutAttempt", checkoutAttemptSchema);
  models.Order = mongoose.model("Order", orderSchema);
  models.RefundOperation = mongoose.model("RefundOperation", refundOperationSchema);
  models.Dispute = mongoose.model("Dispute", disputeSchema);
  models.ReceivedStripeEvent = mongoose.model("ReceivedStripeEvent", receivedStripeEventSchema);
  models.OrderActivity = mongoose.model("OrderActivity", orderActivitySchema);
  models.PendingWork = mongoose.model("PendingWork", pendingWorkSchema);
  models.StripePaymentEvidence = mongoose.model("StripePaymentEvidence", stripePaymentEvidenceSchema);
  models.StripeScanProgress = mongoose.model("StripeScanProgress", stripeScanProgressSchema);

  await models.ReceivedStripeEvent.init();
  console.log(`[startup] mongoose models created after ${Date.now() - connectionStartedAt}ms`);
}

export { models, connectToDatabase };

