/*
Purpose: Replay an existing checkout attempt or advance it toward payment when safe.
Authentication/Authorization Requirements: None. Used internally by the checkout coordinator.
Expected Request Information:
- Mongoose models, the stored attempt record, the cart fingerprint, and configuration/timing parameters.
Expected Response Information:
- A checkout result object: ready with the payment URL, pending, reconciliation_required, conflict, or a finished status.
*/

import { isFinishedAttempt } from "../domain.js";
import {
  attachReadySession,
  isReusableStripeSession,
  markAttemptForManualCheck,
} from "./paymentSession.js";
import {
  conflictResult,
  finishedResult,
  needsManualCheckResult,
  readyResult,
  stillProcessingResult,
  unavailable,
} from "./results.js";

const MAX_RETRY_AGE_MS = 23 * 60 * 60 * 1000;

/**
 * @behavior Read the human-readable order reference from the order record linked to an attempt.
 * @param models — Mongoose models providing the Order collection
 * @param attempt — the checkout attempt record containing the orderId
 * @returns the order reference string (such as "ORD-..."), or null if the order was not found
 * @exceptions rejects when the database query fails
 */
async function readOrderReference(models, attempt) {
  const order = await models.Order.findById(attempt.orderId);
  return order?.orderReference ?? null;
}

/**
 * @behavior Replay or resume a previously recorded checkout attempt for the same buyer and retry key.
 * @param models — Mongoose models used to read orders and update attempts
 * @param existing — the stored checkout attempt record from the database
 * @param cartFingerprint — deterministic JSON string representing the cart contents
 * @param checkoutEnabled — whether checkout is currently enabled to send requests to Stripe
 * @param checkoutNow — the Date used as current time for expiry checks
 * @param getProvider — factory function returning the configured Stripe provider client
 * @param normalizedAttemptKey — the lower-cased retry key from the request header
 * @param attemptFilter — query filter matching this buyer's attempt
 * @returns a checkout result object: ready (with payment URL), pending, reconciliation_required, conflict, finished status, or unavailable
 * @exceptions rejects when a database read or update query fails
 */
export async function resumeExistingAttempt({
  models,
  existingAttempt,
  requestCart,
  checkoutEnabled,
  checkoutNow,
  getProvider,
  normalizedAttemptKey,
  attemptQuery,
}) {
  if (existingAttempt.attemptCart !== requestCart) return conflictResult();
  const orderReference = await readOrderReference(models, existingAttempt);
  if (!orderReference) return unavailable();

  if (existingAttempt.status === "ready" && existingAttempt.sessionId) {
    try {
      const provider = await getProvider();
      const session = await provider.retrieveCheckoutSession({
        sessionId: existingAttempt.sessionId,
      });
      if (!isReusableStripeSession(session, checkoutNow)) {
        return stillProcessingResult(existingAttempt, orderReference);
      }
      return readyResult(
        normalizedAttemptKey,
        orderReference,
        session.url,
        false,
      );
    } catch {
      return stillProcessingResult(existingAttempt, orderReference);
    }
  }
  if (existingAttempt.status === "reconciliation_required") {
    return needsManualCheckResult(existingAttempt, orderReference);
  }
  if (isFinishedAttempt(existingAttempt.status)) {
    return finishedResult(existingAttempt, orderReference);
  }
  // A stale attempt stops here: past its own window, or past the age Stripe would still honour.
  if (existingAttempt.expiresAt && checkoutNow >= new Date(existingAttempt.expiresAt)) {
    return needsManualCheckResult(existingAttempt, orderReference);
  }
  if (
    existingAttempt.firstSubmissionAt &&
    checkoutNow.getTime() >=
      new Date(existingAttempt.firstSubmissionAt).getTime() + MAX_RETRY_AGE_MS
  ) {
    return needsManualCheckResult(existingAttempt, orderReference);
  }
  // A disabled checkout blocks only this new Session; the attempt itself stays visible.
  if (!checkoutEnabled) return stillProcessingResult(existingAttempt, orderReference);
  if (!existingAttempt.frozenStripeRequest) {
    return stillProcessingResult(existingAttempt, orderReference);
  }

  // The earlier request died after writing the attempt, before reaching Stripe. Sending the
  // same request again with the same key is safe before either cutoff above is reached.
  let session;
  try {
    const provider = await getProvider();
    session = await provider.createCheckoutSession({
      frozenStripeRequest: existingAttempt.frozenStripeRequest,
      idempotencyKey: existingAttempt.providerIdempotencyKey,
    });
  } catch (error) {
    await markAttemptForManualCheck({
      models,
      attemptQuery,
      reason: "payment_session_not_created",
      error,
    });
    return needsManualCheckResult(existingAttempt, orderReference);
  }

  if (!isReusableStripeSession(session, checkoutNow)) {
    return stillProcessingResult(existingAttempt, orderReference);
  }

  let attached;
  try {
    attached = await attachReadySession(models, attemptQuery, session);
  } catch (error) {
    await markAttemptForManualCheck({
      models,
      attemptQuery,
      reason: "payment_session_not_attached",
      error,
    });
    return needsManualCheckResult(existingAttempt, orderReference);
  }
  if (!attached) return stillProcessingResult(existingAttempt, orderReference);

  return readyResult(
    normalizedAttemptKey,
    orderReference,
    session.url,
    false,
  );
}
