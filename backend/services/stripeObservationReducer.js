/*
Purpose: Decide what a Stripe event means for an order. This is the only place in the backend that
turns what Stripe tells us into facts about an order.
Authentication/Authorization Requirements: None. Nothing here is reachable from a request; the
caller — the webhook route or a reconciliation worker — must prove the event came from Stripe
before passing it in.
Expected Request Information: One normalized Stripe event, plus the order and checkout-attempt
facts it might apply to.
Expected Response Information: The resulting order facts, or a refusal listing what did not line up.
*/

// A payment only counts when we asked Stripe directly, over an authenticated connection, and read
// the current state ourselves. A buyer landing back on the return page, and the request we sent to
// create the Session, both prove nothing about money moving.
const ACCEPTED_PAYMENT_SOURCE = "authenticated_server_retrieval";
const CHECKOUT_SESSION_OBJECT = "checkout.session";
const ONE_TIME_PAYMENT_MODE = "payment";
const COMPLETED_SESSION_STATUS = "complete";
const PAID_PAYMENT_STATUS = "paid";

/*
 * @behavior Read a field that may be missing or hold the wrong type as text, so a missing field and
 *           a field holding the wrong value are both refused instead of one slipping past.
 * @param value — the value to read
 * @returns the value when it is a string, otherwise an empty string
 */
function asText(value) {
  return typeof value === "string" ? value : "";
}

/*
 * @behavior Check that a value is a plain object rather than null, an array, or something else.
 * @param value — the value to check
 * @returns true when the value is an object that is neither null nor an array
 */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/*
 * @behavior Check that an amount is a whole number of cents.
 * @param value — the amount in cents
 * @returns true when the value is a safe integer of zero or more
 */
function isWholeCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/*
 * @behavior Put a list of line items into price-id order, so two lists holding the same items in
 *           different orders still compare equal.
 * @param items — the line items to sort
 * @returns a sorted copy; the list passed in is left untouched
 */
function sortItems(items) {
  return [...items].sort((left, right) =>
    asText(left.priceId).localeCompare(asText(right.priceId)),
  );
}

/*
 * @behavior Check that the line items Stripe reported match the ones quoted when the checkout
 *           attempt was created: each Stripe Price id with the quantity we sent, and nothing else.
 *           The amount is compared against the session total instead, so the catalogue is never
 *           read to re-price a purchase.
 * @param observed — the line items Stripe reported
 * @param agreed — the line items recorded when the attempt was created
 * @returns true when both lists hold the same price ids with the same quantities
 */
function sameItems(observed, agreed) {
  if (!Array.isArray(observed) || !Array.isArray(agreed)) {
    return false;
  }

  if (observed.length !== agreed.length) {
    return false;
  }

  const observedSorted = sortItems(observed);
  const agreedSorted = sortItems(agreed);

  return observedSorted.every((item, index) => {
    const expectedItem = agreedSorted[index];

    return (
      asText(item.priceId) === asText(expectedItem.priceId) &&
      item.quantity === expectedItem.quantity
    );
  });
}

/*
 * @behavior Decide whether a checkout session we retrieved from Stripe proves the buyer paid for
 *           exactly what was quoted, from the account and mode this deployment is configured for.
 *           Every failed check is collected rather than stopping at the first, so an operator sees
 *           the whole picture; paid means no check failed.
 * @param session — the checkout session as Stripe reported it when we retrieved it ourselves
 * @param expected — the facts frozen when the checkout attempt was created: the session id, account
 *                   id, mode, currency, total in cents, line items, and the attempt and order ids
 * @returns { paid, reasons } — paid is true only when every check passed; reasons holds one plain
 *          sentence per failed check
 */
export function evaluatePaidCheckoutSession({ session, expected } = {}) {
  if (!isPlainObject(session) || !isPlainObject(expected)) {
    return {
      paid: false,
      reasons: ["there is no verified payment to evaluate"],
    };
  }

  const reasons = [];

  if (session.source !== ACCEPTED_PAYMENT_SOURCE) {
    reasons.push(
      "the payment was not confirmed by retrieving it directly from Stripe",
    );
  }

  if (session.objectType !== CHECKOUT_SESSION_OBJECT) {
    reasons.push("the payment is not a checkout session");
  }

  if (asText(session.objectId) !== asText(expected.sessionId)) {
    reasons.push("the checkout session is not the one that was started");
  }

  if (session.mode !== ONE_TIME_PAYMENT_MODE) {
    reasons.push("the checkout session is not a one-time payment");
  }

  if (session.status !== COMPLETED_SESSION_STATUS) {
    reasons.push("the buyer has not finished the checkout session");
  }

  if (session.paymentStatus !== PAID_PAYMENT_STATUS) {
    reasons.push("the checkout session has not been paid");
  }

  if (asText(session.accountId) !== asText(expected.accountId)) {
    reasons.push("the payment belongs to a different Stripe account");
  }

  if (session.livemode !== expected.livemode) {
    reasons.push("the payment is from a different Stripe mode");
  }

  if (asText(session.currency) !== asText(expected.currency)) {
    reasons.push("the payment is in a different currency");
  }

  if (
    !isWholeCents(session.amountTotalCents) ||
    session.amountTotalCents !== expected.amountTotalCents
  ) {
    reasons.push("the amount paid does not match the amount quoted");
  }

  if (!sameItems(session.items, expected.lineItems)) {
    reasons.push("the prices paid for are not the prices we quoted");
  }

  const metadata = isPlainObject(session.metadata) ? session.metadata : {};

  if (
    asText(metadata.attemptId) !== asText(expected.attemptId) ||
    asText(metadata.orderId) !== asText(expected.orderId)
  ) {
    reasons.push("the payment is not marked with the order it belongs to");
  }

  return { paid: reasons.length === 0, reasons };
}

// Which id on an attempt each kind of Stripe object is allowed to fill. Anything else has no
// business writing to an attempt.
const ID_FIELDS_BY_OBJECT = Object.freeze({
  [CHECKOUT_SESSION_OBJECT]: "sessionId",
  payment_intent: "paymentIntentId",
});

// An id is only recorded when it comes from somewhere Stripe authenticated for us: our own
// retrieval, or a signed webhook.
const VERIFIED_SOURCES = Object.freeze(
  new Set([ACCEPTED_PAYMENT_SOURCE, "signed_webhook"]),
);

/*
 * @behavior Decide whether a Stripe event may fill in an id that is still missing on a checkout
 *           attempt. A PaymentIntent id is only known after Stripe mints it, so it is recorded
 *           later; this only ever fills a gap, never rewrites an id already stored, so a repeated
 *           delivery has nothing to do.
 * @param attempt — the stored checkout attempt, including the account and mode it was created for
 * @param observation — one normalized Stripe event carrying the id
 * @returns { allowed, reasons } — allowed is true only when every check passed; reasons holds one
 *          plain sentence per failed check
 */
export function evaluateProviderIdAttachment({ attempt, observation } = {}) {
  if (!isPlainObject(attempt) || !isPlainObject(observation)) {
    return {
      allowed: false,
      reasons: ["there is no attempt and observation to compare"],
    };
  }

  const reasons = [];

  if (!VERIFIED_SOURCES.has(observation.source)) {
    reasons.push("the id did not come from a source Stripe authenticated for us");
  }

  if (asText(observation.accountId) !== asText(attempt.providerAccountId)) {
    reasons.push("the id belongs to a different Stripe account");
  }

  if (observation.livemode !== (asText(attempt.providerMode) === "live")) {
    reasons.push("the id is from a different Stripe mode");
  }

  const field = ID_FIELDS_BY_OBJECT[asText(observation.objectType)];

  if (field === undefined) {
    reasons.push("an attempt records no id of this kind");
  }

  const observedId = asText(observation.objectId);

  if (observedId === "") {
    reasons.push("the observation carries no id to record");
  }

  // A PaymentIntent reports which session it belongs to, so a disagreeing session means the id
  // belongs to a different purchase even when the account and mode happen to line up.
  const observedSessionId = asText(observation.sessionId);

  if (
    observedSessionId !== "" &&
    observedSessionId !== asText(attempt.sessionId)
  ) {
    reasons.push("the id belongs to a different checkout session");
  }

  if (field !== undefined && observedId !== "") {
    const recordedId = asText(attempt[field]);

    if (recordedId !== "" && recordedId !== observedId) {
      reasons.push("a different id is already recorded for this attempt");
    }
  }

  return { allowed: reasons.length === 0, reasons };
}

const PAYMENT_INTENT_OBJECT = "payment_intent";
const SUCCEEDED_PAYMENT_INTENT_STATUS = "succeeded";

/*
 * @behavior Decide whether a PaymentIntent agrees with a payment already proven by a retrieved
 *           checkout session. This is a second opinion only: a payment intent on its own never
 *           proves payment, so nothing here can make an order paid.
 * @param paymentIntent — one normalized PaymentIntent event, from a webhook or a retrieval
 * @param expected — the same frozen facts the paid-checkout decision compares against
 * @returns { supports, reasons } — supports is true only when every check passed; reasons holds one
 *          plain sentence per failed check
 */
export function evaluateSupportingPaymentIntentEvidence({ paymentIntent, expected } = {}) {
  if (!isPlainObject(paymentIntent) || !isPlainObject(expected)) {
    return {
      supports: false,
      reasons: ["there is no verified payment to compare"],
    };
  }

  const reasons = [];

  if (!VERIFIED_SOURCES.has(paymentIntent.source)) {
    reasons.push(
      "the payment intent did not come from a source Stripe authenticated for us",
    );
  }

  if (asText(paymentIntent.objectType) !== PAYMENT_INTENT_OBJECT) {
    reasons.push("the observation is not a payment intent");
  }

  if (asText(paymentIntent.objectId) === "") {
    reasons.push("the payment intent carries no id");
  }

  if (asText(paymentIntent.status) !== SUCCEEDED_PAYMENT_INTENT_STATUS) {
    reasons.push("the payment intent has not succeeded");
  }

  if (asText(paymentIntent.accountId) !== asText(expected.accountId)) {
    reasons.push("the payment intent belongs to a different Stripe account");
  }

  if (paymentIntent.livemode !== expected.livemode) {
    reasons.push("the payment intent is from a different Stripe mode");
  }

  if (asText(paymentIntent.currency) !== asText(expected.currency)) {
    reasons.push("the payment intent is in a different currency");
  }

  if (paymentIntent.amountCents !== expected.amountCents) {
    reasons.push("the payment intent is for a different amount");
  }

  if (asText(paymentIntent.sessionId) !== asText(expected.sessionId)) {
    reasons.push("the payment intent belongs to a different checkout session");
  }

  const metadata = isPlainObject(paymentIntent.metadata) ? paymentIntent.metadata : {};

  if (asText(metadata.attemptId) !== asText(expected.attemptId)) {
    reasons.push("the payment intent names a different checkout attempt");
  }

  if (asText(metadata.orderId) !== asText(expected.orderId)) {
    reasons.push("the payment intent names a different order");
  }

  return { supports: reasons.length === 0, reasons };
}

const PAID_PAYMENT_STATE = "paid";
const UNPAID_PAYMENT_STATE = "pending";

/*
 * @behavior Decide the next payment state of an order. Payment is a one-way door: a paid order
 *           stays paid, because the money really was collected, and a later failure, refund, or
 *           dispute is recorded as its own fact instead of taking the payment back. Only a
 *           retrieved checkout session that passes every check moves payment forward.
 * @param order — the order facts as they are stored now
 * @param observation — one normalized Stripe event under consideration
 * @param expected — the frozen facts the payment has to match
 * @returns { nextState, changed, reasons } — nextState is the payment state to store, changed says
 *          whether it differs from what is stored, and reasons holds one plain sentence per failed
 *          check when nothing changed
 */
export function evaluatePaymentStateTransition({ order, observation, expected } = {}) {
  if (!isPlainObject(order)) {
    return {
      nextState: UNPAID_PAYMENT_STATE,
      changed: false,
      reasons: ["there is no order to update"],
    };
  }

  const isAlreadyPaid = asText(order.paymentState) === PAID_PAYMENT_STATE;

  if (isAlreadyPaid) {
    return {
      nextState: PAID_PAYMENT_STATE,
      changed: false,
      reasons: ["the order is already paid, and a paid order never goes back"],
    };
  }

  const decision = evaluatePaidCheckoutSession({ session: observation, expected });

  if (!decision.paid) {
    return {
      nextState: UNPAID_PAYMENT_STATE,
      changed: false,
      reasons: decision.reasons,
    };
  }

  return { nextState: PAID_PAYMENT_STATE, changed: true, reasons: [] };
}

