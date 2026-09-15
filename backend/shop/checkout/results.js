export function readyResult(attemptKey, orderReference, checkoutUrl, isNew) {
  return { status: "ready", isNew, attemptKey, orderReference, checkoutUrl };
}

export function stillProcessingResult(attempt, orderReference) {
  return {
    status: "pending",
    attemptKey: attempt.attemptKey,
    orderReference,
  };
}

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

export function finishedResult(attempt, orderReference) {
  return {
    status: attempt.status,
    attemptKey: attempt.attemptKey,
    orderReference,
  };
}
