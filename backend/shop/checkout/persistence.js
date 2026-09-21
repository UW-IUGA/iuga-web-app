/*
Purpose: Hold stock and persist the order and attempt records together in a single database transaction.
Authentication/Authorization Requirements: None. Used internally by the checkout coordinator.
Expected Request Information:
- Mongoose models, prepared checkout documents and cart, and a database transaction runner.
Expected Response Information:
- An object indicating success ({ ok: true }) or failure ({ ok: false, error }).
*/

import { holdInventory } from "../reservations.js";

// The hold must last exactly as long as the payment link, so it is measured from the prepared
// attempt instead of repeated here as a second one-hour literal.
function holdDurationMs(attemptDocument) {
  return (
    new Date(attemptDocument.expiresAt).getTime() -
    new Date(attemptDocument.firstSubmissionAt).getTime()
  );
}

/**
 * @behavior Save a new checkout in one database transaction: hold stock for the cart, create
 *           the pending order, and record the attempt, so a partial checkout is never left behind.
 * @param models — Mongoose models used to store the order and attempt records
 * @param checkout — the prepared checkout data (orderDocument, attemptDocument, cart, catalogRows)
 * @param transaction — database transaction runner that commits all writes as a unit
 * @returns an object with ok: true on success, or ok: false and the error if any write or hold fails
 */
export async function persistNewCheckout({ models, checkout, transaction }) {
  try {
    // The stock hold, the order, and the attempt are written together. If any one fails, none is
    // kept — never stock held for a missing order, nor an order with no stock behind it.
    await transaction(async (session) => {
      // The hold lasts exactly as long as the payment link: shorter could give the stock away
      // while the buyer can still pay, longer would sit on stock for a dead attempt.
      await holdInventory({
        models,
        orderId: checkout.orderDocument._id,
        items: checkout.cart,
        catalog: checkout.catalogRows,
        now: checkout.attemptDocument.firstSubmissionAt,
        ttlMs: holdDurationMs(checkout.attemptDocument),
        session,
      });
      await models.Order.create([checkout.orderDocument], { session });
      await models.CheckoutAttempt.create([checkout.attemptDocument], { session });
    });
  } catch (error) {
    return { ok: false, error };
  }
  return { ok: true };
}
