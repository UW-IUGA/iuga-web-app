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

export async function createPaymentSession({ models, checkout, getProvider }) {
  // Only now do we involve money: the attempt is written down, so a failure here is recoverable
  // by looking the attempt up again rather than by charging anyone twice.
  try {
    const provider = await getProvider();
    const session = await provider.createCheckoutSession({
      frozenStripeRequest: checkout.frozenStripeRequest,
      idempotencyKey: checkout.providerIdempotencyKey,
    });
    if (!isReusableStripeSession(session, checkout.checkoutNow)) {
      return stillProcessingResult(checkout.attemptDocument, checkout.orderReference);
    }
    const attached = await attachReadySession(models, checkout.attemptQuery, session);
    if (!attached) return stillProcessingResult(checkout.attemptDocument, checkout.orderReference);
    return readyResult(checkout.attemptDocument.attemptKey, checkout.orderReference, session.url, true);
  } catch {
    await models.CheckoutAttempt.findOneAndUpdate(
      { ...checkout.attemptQuery, status: "pending" },
      { $set: { status: "reconciliation_required" } },
    );
    return needsManualCheckResult(checkout.attemptDocument, checkout.orderReference);
  }
}
