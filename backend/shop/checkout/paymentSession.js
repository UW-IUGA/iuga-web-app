/*
Purpose: Create and attach a Stripe Checkout Session to a recorded checkout attempt.
Authentication/Authorization Requirements: None. Used internally by the checkout coordinator.
Expected Request Information:
- Mongoose models, prepared checkout data, and a Stripe provider factory.
Expected Response Information:
- A checkout result object: ready with a payment link, pending, or reconciliation_required.
*/

import {
  needsManualCheckResult,
  readyResult,
  stillProcessingResult,
} from "./results.js";

/**
 * @behavior Check whether a Stripe checkout session is open, carries a payment URL, and has not yet expired.
 * @param session — the checkout session object returned by Stripe
 * @param now — the current Date used to verify the session expiry
 * @returns true when the session is open, has a usable URL, and expires in the future; false otherwise
 */
export function isReusableStripeSession(session, now) {
  const expiresAt =
    typeof session?.expiresAt === "number"
      ? session.expiresAt * 1000
      : new Date(session?.expiresAt).getTime();
  return (
    session?.status === "open" &&
    session.url &&
    Number.isFinite(expiresAt) &&
    expiresAt > now.getTime()
  );
}

/**
 * @behavior Attach an open Stripe checkout session to a pending checkout attempt and mark it ready.
 * @param models — Mongoose models providing the CheckoutAttempt collection
 * @param attemptQuery — query filter matching the buyer's checkout attempt
 * @param session — the Stripe checkout session with id, URL, and optional payment intent id
 * @returns the updated CheckoutAttempt document, or null if the attempt was not found or no longer pending
 * @exceptions rejects when the database update query fails
 */
export async function attachReadySession(models, attemptQuery, session) {
  return models.CheckoutAttempt.findOneAndUpdate(
    { ...attemptQuery, status: "pending" },
    {
      $set: {
        status: "ready",
        sessionId: session.id,
        paymentIntentId: session.paymentIntentId ?? null,
      },
    },
  );
}

// Store the error's code, never its message: Stripe's messages can repeat API keys and card
// details, and an unexpected error's message can expose our own internals to the admin reading
// the attempt later.
function safeErrorCode(error) {
  const code = error?.code;
  return typeof code === "string" && code.trim().length > 0 ? code.trim() : "unknown";
}

/**
 * @behavior Flag an attempt for an admin to look at: mark it reconciliation_required, record the
 *           stage that failed, and store that failure's safe error code, so an admin can see where
 *           the attempt stopped instead of rebuilding it from Stripe.
 * @param models — the collections the attempt lives in
 * @param attemptQuery — which attempt to flag, already scoped to its buyer
 * @param reason — the stage that failed, e.g. payment_session_not_created
 * @param error — the caught failure; only its own short code is kept
 */
export async function markAttemptForManualCheck({ models, attemptQuery, reason, error }) {
  await models.CheckoutAttempt.findOneAndUpdate(
    { ...attemptQuery, status: "pending" },
    {
      $set: {
        status: "reconciliation_required",
        reconciliationReason: reason,
        lastErrorCode: safeErrorCode(error),
      },
    },
  );
}

/**
 * @behavior Request a Stripe Checkout Session for a persisted attempt and attach its payment link.
 * @param models — Mongoose models used to update the checkout attempt
 * @param checkout — the prepared checkout data, attempt document, order reference, and frozen Stripe request
 * @param getProvider — factory function returning the configured Stripe provider client
 * @returns readyResult with the payment URL, stillProcessingResult if unconfirmed, or needsManualCheckResult on failure
 * @exceptions rejects if updating the attempt to reconciliation_required fails
 */
export async function createPaymentSession({ models, checkout, getProvider }) {
  // Only now do we involve money: the attempt is written down, so a failure here is recoverable
  // by looking the attempt up again rather than by charging anyone twice.
  let session;
  try {
    const provider = await getProvider();
    session = await provider.createCheckoutSession({
      frozenStripeRequest: checkout.frozenStripeRequest,
      idempotencyKey: checkout.providerIdempotencyKey,
    });
  } catch (error) {
    await markAttemptForManualCheck({
      models,
      attemptQuery: checkout.attemptQuery,
      reason: "payment_session_not_created",
      error,
    });
    return needsManualCheckResult(checkout.attemptDocument, checkout.orderReference);
  }

  if (!isReusableStripeSession(session, checkout.checkoutNow)) {
    return stillProcessingResult(checkout.attemptDocument, checkout.orderReference);
  }

  // Attaching is its own stage: the session exists either way, so a failure here is a different
  // thing to reconcile than a request that never produced one.
  let attached;
  try {
    attached = await attachReadySession(models, checkout.attemptQuery, session);
  } catch (error) {
    await markAttemptForManualCheck({
      models,
      attemptQuery: checkout.attemptQuery,
      reason: "payment_session_not_attached",
      error,
    });
    return needsManualCheckResult(checkout.attemptDocument, checkout.orderReference);
  }
  if (!attached) return stillProcessingResult(checkout.attemptDocument, checkout.orderReference);

  return readyResult(checkout.attemptDocument.attemptKey, checkout.orderReference, session.url, true);
}
