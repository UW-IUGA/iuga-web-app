import {
  needsManualCheckResult,
  readyResult,
  stillProcessingResult,
} from "./results.js";

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

/*
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
