/*
 * Purpose: The rule that decides a checkout is genuinely paid, and the facts that follow from it.
 * Authentication/Authorization Requirements: None. Every case here is a pure decision over
 *   provider data that has already been verified; nothing in this file contacts Stripe, and
 *   nothing reads or writes the database.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluatePaidCheckoutSession,
  evaluatePaymentStateTransition,
  evaluateProviderIdAttachment,
  evaluateSupportingPaymentIntentEvidence,
} from "../services/stripeObservationReducer.js";

const ACCOUNT_ID = "acct_test_fixture";
const SESSION_ID = "cs_test_0001";
const ATTEMPT_ID = "attempt_0001";
const ORDER_ID = "order_0001";

// What the buyer already agreed to when the attempt was created: the total we froze, plus the ids
// we stamped into the Session. Payment only counts when the retrieval still matches this.
const EXPECTED = Object.freeze({
  accountId: ACCOUNT_ID,
  livemode: false,
  currency: "usd",
  amountTotalCents: 4500,
  attemptId: ATTEMPT_ID,
  orderId: ORDER_ID,
  sessionId: SESSION_ID,
});

// A retrieval that passes every check. Each case below changes exactly one thing about it.
function retrievedSession(overrides = {}) {
  return {
    source: "authenticated_server_retrieval",
    accountId: ACCOUNT_ID,
    livemode: false,
    objectType: "checkout.session",
    objectId: SESSION_ID,
    mode: "payment",
    status: "complete",
    paymentStatus: "paid",
    currency: "usd",
    amountTotalCents: 4500,
    paymentIntentId: "pi_test_0001",
    metadata: { attemptId: ATTEMPT_ID, orderId: ORDER_ID },
    ...overrides,
  };
}

function evaluate(overrides = {}) {
  return evaluatePaidCheckoutSession({
    session: retrievedSession(overrides),
    expected: EXPECTED,
  });
}

describe("Paid checkout predicate", () => {
  it("treats an authenticated retrieval matching every agreed fact as paid", () => {
    const decision = evaluate();

    assert.equal(decision.paid, true);
    assert.deepEqual(decision.reasons, []);
  });

  it("reports why a rejected retrieval was rejected", () => {
    const decision = evaluate({ amountTotalCents: 9999 });

    assert.equal(decision.paid, false);
    assert.ok(
      decision.reasons.length > 0,
      "A refused payment must say what did not line up",
    );
  });

  // A browser landing on the return URL proves only that the buyer came back. The redirect is not
  // authenticated, so it can never establish that money moved.
  it("refuses a browser return even when its contents look complete", () => {
    assert.equal(evaluate({ source: "browser_return" }).paid, false);
  });

  // The Session we just created is our own request echoed back; it says nothing about payment.
  it("refuses a Session creation response", () => {
    assert.equal(evaluate({ source: "session_creation_response" }).paid, false);
  });

  it("refuses an unknown source", () => {
    assert.equal(evaluate({ source: "trust_me" }).paid, false);
  });

  it("refuses a missing source", () => {
    const decision = evaluatePaidCheckoutSession({
      session: { ...retrievedSession(), source: undefined },
      expected: EXPECTED,
    });

    assert.equal(decision.paid, false);
  });

  const notPaidYet = [
    ["a Session that is not a one-time payment", { mode: "subscription" }],
    ["a Session the buyer has not finished", { status: "open" }],
    ["a Session with no payment status", { paymentStatus: null }],
    ["an unpaid Session", { paymentStatus: "unpaid" }],
    ["a Session with no payment status at all", { paymentStatus: "" }],
  ];

  for (const [description, overrides] of notPaidYet) {
    it(`refuses ${description}`, () => {
      assert.equal(evaluate(overrides).paid, false);
    });
  }

  const wrongContext = [
    ["another Stripe account", { accountId: "acct_someone_else" }],
    ["a live-mode Session on a test-mode account", { livemode: true }],
    ["a different currency", { currency: "eur" }],
    ["a different total", { amountTotalCents: 4400 }],
    ["a missing total", { amountTotalCents: null }],
    ["a Session we cannot identify", { objectId: "cs_test_0002" }],
  ];

  for (const [description, overrides] of wrongContext) {
    it(`refuses ${description}`, () => {
      assert.equal(evaluate(overrides).paid, false);
    });
  }

  const wrongMetadata = [
    ["metadata for a different attempt", { metadata: { attemptId: "attempt_0002", orderId: ORDER_ID } }],
    ["metadata for a different order", { metadata: { attemptId: ATTEMPT_ID, orderId: "order_0002" } }],
    ["metadata missing the attempt", { metadata: { orderId: ORDER_ID } }],
    ["metadata missing the order", { metadata: { attemptId: ATTEMPT_ID } }],
    ["no metadata", { metadata: null }],
  ];

  for (const [description, overrides] of wrongMetadata) {
    it(`refuses ${description}`, () => {
      assert.equal(evaluate(overrides).paid, false);
    });
  }
});

// The attempt is created without a PaymentIntent id, because Stripe only mints one once the buyer
// starts paying. This rule is what decides whether a later observation is allowed to fill that gap.
const ATTEMPT = Object.freeze({
  providerMode: "test",
  providerAccountId: ACCOUNT_ID,
  sessionId: SESSION_ID,
  paymentIntentId: null,
  status: "ready",
});

function attach(observation, attempt = ATTEMPT) {
  return evaluateProviderIdAttachment({ attempt, observation });
}

function paymentIntentObservation(overrides = {}) {
  return {
    source: "authenticated_server_retrieval",
    accountId: ACCOUNT_ID,
    livemode: false,
    objectType: "payment_intent",
    objectId: "pi_test_0001",
    sessionId: SESSION_ID,
    ...overrides,
  };
}

describe("Provider id attachment", () => {
  it("fills a missing PaymentIntent id when everything lines up", () => {
    assert.equal(attach(paymentIntentObservation()).allowed, true);
  });

  it("leaves an id alone when the same one is delivered again", () => {
    const decision = attach(paymentIntentObservation(), {
      ...ATTEMPT,
      paymentIntentId: "pi_test_0001",
    });

    assert.equal(decision.allowed, true);
  });

  it("refuses to replace an id that is already recorded", () => {
    const decision = attach(paymentIntentObservation({ objectId: "pi_test_0002" }), {
      ...ATTEMPT,
      paymentIntentId: "pi_test_0001",
    });

    assert.equal(decision.allowed, false);
    assert.ok(decision.reasons.length > 0, "A refusal must say what did not line up");
  });

  it("refuses an id recorded by a different Stripe account", () => {
    assert.equal(attach(paymentIntentObservation({ accountId: "acct_someone_else" })).allowed, false);
  });

  it("refuses a live-mode id on a test-mode attempt", () => {
    assert.equal(attach(paymentIntentObservation({ livemode: true })).allowed, false);
  });

  it("refuses an id that came from a browser return", () => {
    assert.equal(attach(paymentIntentObservation({ source: "browser_return" })).allowed, false);
  });

  it("refuses an observation carrying no id", () => {
    assert.equal(attach(paymentIntentObservation({ objectId: "" })).allowed, false);
  });

  it("refuses an observation of a kind that has no place on an attempt", () => {
    assert.equal(attach(paymentIntentObservation({ objectType: "charge" })).allowed, false);
  });

  it("refuses a PaymentIntent that belongs to a different checkout session", () => {
    const decision = attach(paymentIntentObservation({ sessionId: "cs_test_0002" }));

    assert.equal(decision.allowed, false);
  });

  it("fills a missing PaymentIntent id from a signed webhook", () => {
    assert.equal(attach(paymentIntentObservation({ source: "signed_webhook" })).allowed, true);
  });

  it("fills a missing Session id from the session itself", () => {
    const decision = attach(
      {
        source: "authenticated_server_retrieval",
        accountId: ACCOUNT_ID,
        livemode: false,
        objectType: "checkout.session",
        objectId: SESSION_ID,
      },
      { ...ATTEMPT, sessionId: null },
    );

    assert.equal(decision.allowed, true);
  });
});

const AGREED_PAYMENT_INTENT = Object.freeze({
  accountId: ACCOUNT_ID,
  livemode: false,
  currency: "usd",
  amountCents: 4500,
  attemptId: ATTEMPT_ID,
  orderId: ORDER_ID,
  sessionId: SESSION_ID,
});

function paymentIntentEvidence(overrides = {}) {
  return {
    source: "authenticated_server_retrieval",
    accountId: ACCOUNT_ID,
    livemode: false,
    objectType: "payment_intent",
    objectId: "pi_test_0001",
    status: "succeeded",
    currency: "usd",
    amountCents: 4500,
    sessionId: SESSION_ID,
    metadata: { attemptId: ATTEMPT_ID, orderId: ORDER_ID },
    ...overrides,
  };
}

function supports(overrides = {}) {
  return evaluateSupportingPaymentIntentEvidence({
    paymentIntent: paymentIntentEvidence(overrides),
    expected: AGREED_PAYMENT_INTENT,
  });
}

// The PaymentIntent is the second opinion, never the verdict. These cases pin down which second
// opinions are worth listening to at all.
describe("Supporting payment intent evidence", () => {
  it("supports a succeeded PaymentIntent matching every agreed fact", () => {
    const decision = supports();

    assert.equal(decision.supports, true);
    assert.deepEqual(decision.reasons, []);
  });

  it("reports why a PaymentIntent was not accepted as support", () => {
    const decision = supports({ amountCents: 9999 });

    assert.equal(decision.supports, false);
    assert.ok(decision.reasons.length > 0, "A refusal must say what did not line up");
  });

  const notSucceeded = [
    ["a PaymentIntent the buyer has not finished", { status: "requires_action" }],
    ["a PaymentIntent that failed", { status: "requires_payment_method" }],
    ["a PaymentIntent with no status", { status: null }],
    ["a PaymentIntent with no id", { objectId: "" }],
  ];

  for (const [description, overrides] of notSucceeded) {
    it(`refuses ${description}`, () => {
      assert.equal(supports(overrides).supports, false);
    });
  }

  const neverAuthenticated = [
    ["a browser return", { source: "browser_return" }],
    ["a Session creation response", { source: "session_creation_response" }],
    ["an unknown source", { source: "trust_me" }],
    ["a missing source", { source: undefined }],
  ];

  for (const [description, overrides] of neverAuthenticated) {
    it(`refuses a PaymentIntent learned from ${description}`, () => {
      assert.equal(supports(overrides).supports, false);
    });
  }

  const disagreeing = [
    ["a different amount", { amountCents: 4400 }],
    ["a missing amount", { amountCents: null }],
    ["a different currency", { currency: "eur" }],
    ["another Stripe account", { accountId: "acct_someone_else" }],
    ["a live-mode PaymentIntent on a test-mode attempt", { livemode: true }],
    ["a different checkout session", { sessionId: "cs_test_0002" }],
    ["metadata for a different order", { metadata: { attemptId: ATTEMPT_ID, orderId: "order_0002" } }],
    ["metadata missing the attempt", { metadata: { orderId: ORDER_ID } }],
    ["no metadata", { metadata: null }],
  ];

  for (const [description, overrides] of disagreeing) {
    it(`refuses ${description}`, () => {
      assert.equal(supports(overrides).supports, false);
    });
  }

  it("refuses an observation that is not a PaymentIntent", () => {
    assert.equal(supports({ objectType: "charge" }).supports, false);
  });

  it("refuses when there is nothing to compare", () => {
    const decision = evaluateSupportingPaymentIntentEvidence({
      paymentIntent: null,
      expected: AGREED_PAYMENT_INTENT,
    });

    assert.equal(decision.supports, false);
    assert.ok(decision.reasons.length > 0);
  });
});

function transition({ paymentState, observation = retrievedSession(), expected = EXPECTED } = {}) {
  return evaluatePaymentStateTransition({
    order: { paymentState },
    observation,
    expected,
  });
}

// Money, once collected, is a fact. These cases pin down that no later event can quietly undo it.
describe("Payment state monotonicity", () => {
  it("becomes paid on a passing retrieval", () => {
    const decision = transition({ paymentState: "pending" });

    assert.equal(decision.nextState, "paid");
    assert.equal(decision.changed, true);
  });

  it("treats an order with no payment state yet as not paid", () => {
    const decision = transition({ paymentState: undefined });

    assert.equal(decision.nextState, "paid");
    assert.equal(decision.changed, true);
  });

  it("stays pending on a refused retrieval and says why", () => {
    const decision = transition({
      paymentState: "pending",
      observation: retrievedSession({ paymentStatus: "unpaid" }),
    });

    assert.equal(decision.nextState, "pending");
    assert.equal(decision.changed, false);
    assert.ok(decision.reasons.length > 0, "A refusal must say what did not line up");
  });

  it("stays paid when the same evidence arrives a second time", () => {
    const decision = transition({ paymentState: "paid" });

    assert.equal(decision.nextState, "paid");
    assert.equal(decision.changed, false);
  });

  it("stays paid when a stale failure arrives afterwards", () => {
    const decision = transition({
      paymentState: "paid",
      observation: {
        source: "authenticated_server_retrieval",
        objectType: "checkout.session",
        status: "expired",
        paymentStatus: "unpaid",
      },
    });

    assert.equal(decision.nextState, "paid");
    assert.equal(decision.changed, false);
    assert.ok(decision.reasons.length > 0, "A refusal must say why nothing changed");
  });

  it("stays paid when a refund arrives", () => {
    const decision = transition({
      paymentState: "paid",
      observation: {
        source: "authenticated_server_retrieval",
        objectType: "refund",
        objectId: "re_test_0001",
        status: "succeeded",
      },
    });

    assert.equal(decision.nextState, "paid");
    assert.equal(decision.changed, false);
  });

  it("stays paid when a dispute arrives", () => {
    const decision = transition({
      paymentState: "paid",
      observation: {
        source: "authenticated_server_retrieval",
        objectType: "dispute",
        objectId: "dp_test_0001",
        status: "needs_response",
      },
    });

    assert.equal(decision.nextState, "paid");
    assert.equal(decision.changed, false);
  });

  it("never becomes paid from a refund observation", () => {
    const decision = transition({
      paymentState: "pending",
      observation: {
        source: "authenticated_server_retrieval",
        objectType: "refund",
        objectId: "re_test_0001",
        status: "succeeded",
      },
    });

    assert.equal(decision.nextState, "pending");
    assert.equal(decision.changed, false);
  });

  it("never becomes paid from a browser return", () => {
    const decision = transition({
      paymentState: "pending",
      observation: retrievedSession({ source: "browser_return" }),
    });

    assert.equal(decision.nextState, "pending");
    assert.equal(decision.changed, false);
  });

  it("refuses when there is no order to update", () => {
    const decision = evaluatePaymentStateTransition({
      order: null,
      observation: retrievedSession(),
      expected: EXPECTED,
    });

    assert.equal(decision.changed, false);
    assert.ok(decision.reasons.length > 0);
  });
});
