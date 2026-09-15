import { holdInventory } from "../reservations.js";

/*
 * @behavior  Persists a new checkout as one unit — holds inventory, creates the order, and
 *            records the attempt together, so a partial checkout is never left behind.
 * @param     models — collections used to write the order and attempt documents.
 * @param     checkout — the prepared documents and inputs: orderDocument, attemptDocument, cart, catalogRows.
 * @param     transaction — runner that supplies the session and commits all writes as a unit.
 * @returns   { ok: true } on success; { ok: false, error } with the cause on failure.
 * @exceptions Never throws — transaction failures are returned, not raised, so the caller decides the response.
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
        ttlMs: 60 * 60 * 1000,
        session,
      });
      await models.Order.create(checkout.orderDocument, { session });
      await models.CheckoutAttempt.create(checkout.attemptDocument, {
        session,
      });
    });
  } catch (error) {
    return { ok: false, error };
  }
  return { ok: true };
}
