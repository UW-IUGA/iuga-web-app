import { isFinishedAttempt } from "../domain.js";
import {
  attachReadySession,
  isReusableStripeSession,
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
  // Keep an existing attempt visible while new checkout is disabled; do not hide durable state
  // or send another request to Stripe.
  if (!checkoutEnabled) return stillProcessingResult(existingAttempt, orderReference);
  if (!existingAttempt.frozenStripeRequest) {
    return stillProcessingResult(existingAttempt, orderReference);
  }

  // The earlier request died after writing the attempt, before reaching Stripe. Sending the
  // same request again with the same key is safe before either cutoff above is reached.
  try {
    const provider = await getProvider();
    const session = await provider.createCheckoutSession({
      frozenStripeRequest: existingAttempt.frozenStripeRequest,
      idempotencyKey: existingAttempt.providerIdempotencyKey,
    });
    if (!isReusableStripeSession(session, checkoutNow)) {
      return stillProcessingResult(existingAttempt, orderReference);
    }
    const attached = await attachReadySession(models, attemptQuery, session);
    if (!attached) return stillProcessingResult(existingAttempt, orderReference);
    return readyResult(
      normalizedAttemptKey,
      orderReference,
      session.url,
      false,
    );
  } catch {
    await models.CheckoutAttempt.findOneAndUpdate(
      { ...attemptQuery, status: "pending" },
      { $set: { status: "reconciliation_required" } },
    );
    return needsManualCheckResult(existingAttempt, orderReference);
  }
}
