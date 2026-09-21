/*
Purpose: Build the standard result objects returned across the checkout flow.
Authentication/Authorization Requirements: None. Used internally by checkout steps.
Expected Request Information:
- Arguments passed to each builder function: attempt keys, order references, Stripe URLs, or attempt records.
Expected Response Information:
- Result objects indicating the state of a checkout attempt (such as ready, pending, reconciliation_required, unavailable, conflict, or finished).
*/

/**
 * @behavior Build a successful checkout result when an open, unexpired Stripe payment link is
 *           ready for the buyer.
 * @param attemptKey — the lower-cased retry key identifying this purchase attempt
 * @param orderReference — the human-readable order identifier shown to the buyer
 * @param checkoutUrl — the hosted Stripe payment page URL
 * @param isNew — true when the payment link was just created; false when replayed from an earlier attempt
 * @returns a result object with status "ready", isNew, attemptKey, orderReference, and checkoutUrl
 */
export function readyResult(attemptKey, orderReference, checkoutUrl, isNew) {
  return { status: "ready", isNew, attemptKey, orderReference, checkoutUrl };
}

/**
 * @behavior Build a pending result when a checkout attempt is still being processed or waiting on Stripe.
 * @param attempt — the checkout attempt record
 * @param orderReference — the human-readable order identifier shown to the buyer
 * @returns a result object with status "pending", attemptKey, and orderReference
 */
export function stillProcessingResult(attempt, orderReference) {
  return {
    status: "pending",
    attemptKey: attempt.attemptKey,
    orderReference,
  };
}

/**
 * @behavior Build a result indicating Stripe's outcome is unclear or the attempt is too old,
 *           requiring a admin to check before retrying.
 * @param attempt — the checkout attempt record
 * @param orderReference — the human-readable order identifier shown to the buyer
 * @returns a result object with status "reconciliation_required", attemptKey, and orderReference
 */
export function needsManualCheckResult(attempt, orderReference) {
  return {
    status: "reconciliation_required",
    attemptKey: attempt.attemptKey,
    orderReference,
  };
}

export function unavailable() {
  return { status: "unavailable" };
}

export function conflictResult() {
  return { status: "conflict" };
}

/**
 * @behavior Build a result reporting the terminal status of an attempt that has already finished.
 * @param attempt — the checkout attempt record whose status is terminal, such as "expired" or "failed"
 * @param orderReference — the human-readable order identifier shown to the buyer
 * @returns a result object with the attempt's finished status, attemptKey, and orderReference
 */
export function finishedResult(attempt, orderReference) {
  return {
    status: attempt.status,
    attemptKey: attempt.attemptKey,
    orderReference,
  };
}
