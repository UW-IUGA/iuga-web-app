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
  existing,
  cartFingerprint,
  checkoutEnabled,
  checkoutNow,
  getProvider,
  normalizedAttemptKey,
  attemptFilter,
}) {
  if (existing.cartFingerprint !== cartFingerprint) return conflictResult();
  const orderReference = await readOrderReference(models, existing);
  if (!orderReference) return unavailable();

  if (existing.status === "ready" && existing.sessionId) {
    try {
      const provider = await getProvider();
      const session = await provider.retrieveCheckoutSession({
        sessionId: existing.sessionId,
      });
      if (!isReusableStripeSession(session, checkoutNow)) {
        return stillProcessingResult(existing, orderReference);
      }
      return readyResult(
        normalizedAttemptKey,
        orderReference,
        session.url,
        false,
      );
    } catch {
      return stillProcessingResult(existing, orderReference);
    }
  }
  if (existing.status === "reconciliation_required") {
    return needsManualCheckResult(existing, orderReference);
  }
  if (isFinishedAttempt(existing.status)) {
    return finishedResult(existing, orderReference);
  }
  // A stale attempt stops here: past its own window, or past the age Stripe would still honour.
  if (existing.expiresAt && checkoutNow >= new Date(existing.expiresAt)) {
    return needsManualCheckResult(existing, orderReference);
  }
  if (
    existing.firstSubmissionAt &&
    checkoutNow.getTime() >=
      new Date(existing.firstSubmissionAt).getTime() + MAX_RETRY_AGE_MS
  ) {
    return needsManualCheckResult(existing, orderReference);
  }
  // Keep an existing attempt visible while new checkout is disabled; do not hide durable state
  // or send another request to Stripe.
  if (!checkoutEnabled) return stillProcessingResult(existing, orderReference);
  if (!existing.frozenStripeRequest) {
    return stillProcessingResult(existing, orderReference);
  }

  // The earlier request died after writing the attempt, before reaching Stripe. Sending the
  // same request again with the same key is safe before either cutoff above is reached.
  try {
    const provider = await getProvider();
    const session = await provider.createCheckoutSession({
      frozenStripeRequest: existing.frozenStripeRequest,
      idempotencyKey: existing.providerIdempotencyKey,
    });
    if (!isReusableStripeSession(session, checkoutNow)) {
      return stillProcessingResult(existing, orderReference);
    }
    const attached = await attachReadySession(models, attemptFilter, session);
    if (!attached) return stillProcessingResult(existing, orderReference);
    return readyResult(
      normalizedAttemptKey,
      orderReference,
      session.url,
      false,
    );
  } catch {
    await models.CheckoutAttempt.findOneAndUpdate(
      { ...attemptFilter, status: "pending" },
      { $set: { status: "reconciliation_required" } },
    );
    return needsManualCheckResult(existing, orderReference);
  }
}
