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

async function readOrderReference(models, attempt) {
  const order = await models.Order.findById(attempt.orderId);
  return order?.orderReference ?? null;
}

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
