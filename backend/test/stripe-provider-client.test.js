/*
 * @behavior Prove the Stripe boundary sends exactly the fields we decided, reuses our retry key
 *           so a retry cannot become a second charge, and turns every failure into one generic
 *           error that leaks neither our API key nor Stripe's response body.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createStripeProviderClient } from "../services/stripeProviderClient.js";

const SECRET_KEY = "sk_test_never-send-this-real-secret";
const API_VERSION = "2026-08-27.basil";
const SESSION_RESPONSE = {
  id: "cs_test_123",
  url: "https://checkout.stripe.com/c/pay/cs_test_123",
  status: "open",
  expires_at: 1_900_003_600,
  payment_intent: "pi_test_123",
};

function response({ status = 200, json, text } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      if (json instanceof Error) throw json;
      return json;
    },
    async text() {
      if (text instanceof Error) throw text;
      return text ?? JSON.stringify(json);
    },
  };
}

function validClient(overrides = {}) {
  return createStripeProviderClient({
    secretKey: SECRET_KEY,
    apiVersion: API_VERSION,
    fetchImpl: async () => response({ json: SESSION_RESPONSE }),
    ...overrides,
  });
}

// Every failure must look identical from the outside and carry no secret material.
function assertSafeFailure(error) {
  assert.match(error, /Stripe provider request failed/u);
  assert.doesNotMatch(error, new RegExp(SECRET_KEY, "u"));
  assert.doesNotMatch(error, /provider-body-secret|raw-provider-body/u);
}

describe("createStripeProviderClient", () => {
  test("creates a hosted card-only Checkout Session from the locked-in purchase", async () => {
    let request;
    const client = validClient({
      fetchImpl: async (url, init) => {
        request = { url: String(url), init };
        return response({ json: SESSION_RESPONSE });
      },
    });

    const result = await client.createCheckoutSession({
      idempotencyKey: "iuga:checkout:attempt_123",
      frozenStripeRequest: {
        lineItems: [
          { priceId: "price_hoodie", quantity: 2 },
          { priceId: "price_tote", quantity: 1 },
        ],
        successUrl: "https://shop.example.test/checkout/success",
        cancelUrl: "https://shop.example.test/checkout/cancel",
        expiresAt: 1_900_003_600,
        clientReferenceId: "order_opaque_123",
        metadata: {
          attempt: "attempt_123",
          order: "order_opaque_123",
        },
      },
    });

    assert.deepEqual(result, {
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      expiresAt: 1_900_003_600,
      paymentIntentId: "pi_test_123",
      status: "open",
    });
    assert.equal(request.url, "https://api.stripe.com/v1/checkout/sessions");
    assert.equal(request.init.method, "POST");
    assert.equal(request.init.headers.Authorization, `Bearer ${SECRET_KEY}`);
    assert.equal(request.init.headers["Stripe-Version"], API_VERSION);
    assert.equal(request.init.headers["Idempotency-Key"], "iuga:checkout:attempt_123");
    assert.equal(request.init.headers["Content-Type"], "application/x-www-form-urlencoded");

    const fields = new URLSearchParams(request.init.body);
    assert.equal(fields.get("mode"), "payment");
    assert.equal(fields.get("payment_method_types[0]"), "card");
    assert.equal(fields.get("success_url"), "https://shop.example.test/checkout/success");
    assert.equal(fields.get("cancel_url"), "https://shop.example.test/checkout/cancel");
    assert.equal(fields.get("expires_at"), "1900003600");
    assert.equal(fields.get("client_reference_id"), "order_opaque_123");
    assert.equal(fields.get("line_items[0][price]"), "price_hoodie");
    assert.equal(fields.get("line_items[0][quantity]"), "2");
    assert.equal(fields.get("line_items[1][price]"), "price_tote");
    assert.equal(fields.get("line_items[1][quantity]"), "1");
    assert.equal(fields.get("metadata[attempt]"), "attempt_123");
    assert.equal(fields.get("metadata[order]"), "order_opaque_123");
    assert.equal(fields.get("payment_intent_data[metadata][attempt]"), "attempt_123");
    assert.equal(fields.get("payment_intent_data[metadata][order]"), "order_opaque_123");
    // No promotion codes, quantity edits, or customer records: the buyer cannot change our price.
    assert.equal(fields.get("customer_creation"), null);
    assert.equal(fields.get("allow_promotion_codes"), null);
    assert.equal(fields.get("adjustable_quantity[enabled]"), null);
  });

  test("normalizes a successful response with no PaymentIntent", async () => {
    const client = validClient({
      fetchImpl: async () => response({
        json: { ...SESSION_RESPONSE, payment_intent: null },
      }),
    });

    assert.deepEqual(
      await client.createCheckoutSession({
        idempotencyKey: "iuga:checkout:attempt_null-pi",
        frozenStripeRequest: {
          lineItems: [{ priceId: "price_tee", quantity: 1 }],
          successUrl: "https://shop.example.test/success",
          cancelUrl: "https://shop.example.test/cancel",
          expiresAt: 1_900_003_600,
          clientReferenceId: "order_opaque_456",
          metadata: { attempt: "attempt_null-pi" },
        },
      }),
      {
        id: "cs_test_123",
        url: "https://checkout.stripe.com/c/pay/cs_test_123",
        expiresAt: 1_900_003_600,
        paymentIntentId: null,
        status: "open",
      },
    );
  });

  test("reads a Session back by id, escaping the id into the URL", async () => {
    let request;
    const client = validClient({
      fetchImpl: async (url, init) => {
        request = { url: String(url), init };
        return response({ json: SESSION_RESPONSE });
      },
    });

    const result = await client.retrieveCheckoutSession({ sessionId: "cs_test/opaque?value" });

    assert.deepEqual(result, {
      id: "cs_test_123",
      url: "https://checkout.stripe.com/c/pay/cs_test_123",
      expiresAt: 1_900_003_600,
      paymentIntentId: "pi_test_123",
      status: "open",
    });
    assert.equal(request.url, "https://api.stripe.com/v1/checkout/sessions/cs_test%2Fopaque%3Fvalue");
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.headers.Authorization, `Bearer ${SECRET_KEY}`);
    assert.equal(request.init.headers["Stripe-Version"], API_VERSION);
    assert.equal(request.init.headers["Idempotency-Key"], undefined);
  });

  test("rejects missing or malformed configuration before using transport", async () => {
    for (const config of [
      { apiVersion: API_VERSION },
      { secretKey: SECRET_KEY },
      { secretKey: SECRET_KEY, apiVersion: "latest" },
      { secretKey: "not-a-stripe-key", apiVersion: API_VERSION },
    ]) {
      let calls = 0;
      assert.throws(
        () => createStripeProviderClient({ ...config, fetchImpl: async () => { calls += 1; } }),
        (error) => {
          assertSafeFailure(error.message);
          return true;
        },
      );
      assert.equal(calls, 0);
    }
  });

  test("fails safely for transport, non-JSON, malformed, and non-2xx responses", async () => {
    const cases = [
      { fetchImpl: async () => { throw new Error(`network contains ${SECRET_KEY}`); } },
      { fetchImpl: async () => response({ status: 200, text: "raw-provider-body-secret", json: new Error("not json") }) },
      { fetchImpl: async () => response({ json: { id: "cs_missing_fields" } }) },
      { fetchImpl: async () => response({ status: 402, text: "provider-body-secret", json: { error: { message: "provider-body-secret" } } }) },
    ];

    for (const options of cases) {
      const client = validClient(options);
      await assert.rejects(
        client.retrieveCheckoutSession({ sessionId: "cs_test_123" }),
        (error) => {
          assertSafeFailure(error.message);
          return true;
        },
      );
    }
  });

  test("names the failure category while keeping the message generic", async () => {
    assert.throws(
      () => validClient({ secretKey: "pk_test_wrong_prefix" }),
      (error) => {
        assert.equal(error.code, "configuration");
        assertSafeFailure(error.message);
        return true;
      },
    );

    const cases = [
      [{ fetchImpl: async () => { throw new Error(`network contains ${SECRET_KEY}`); } }, "transport"],
      [{ fetchImpl: async () => response({ status: 402, text: "provider-body-secret", json: { error: { message: "provider-body-secret" } } }) }, "provider_rejection"],
      [{ fetchImpl: async () => response({ status: 200, text: "raw-provider-body-secret", json: new Error("not json") }) }, "invalid_response"],
      [{ fetchImpl: async () => response({ json: { id: "cs_missing_fields" } }) }, "invalid_response"],
    ];

    for (const [options, code] of cases) {
      const client = validClient(options);
      await assert.rejects(
        client.retrieveCheckoutSession({ sessionId: "cs_test_123" }),
        (error) => {
          assert.equal(error.code, code);
          assertSafeFailure(error.message);
          return true;
        },
      );
    }
  });
});

/*
 * @behavior Prove the evidence read hands back exactly the facts the payment decision compares,
 *           and refuses a damaged or untrustworthy response instead of half-believing it.
 *           Deciding whether the payment counts is deliberately NOT done here - that is the
 *           reducer's job - so an unpaid Session is reported faithfully, not rejected.
 */
describe("retrievePaymentEvidence", () => {
  const ACCOUNT_ID = "acct_test_evidence";
  const SESSION_ID = "cs_test_evidence";
  const OBSERVED_AT = 1_900_003_600_000;

  const COMPLETED_SESSION = {
    id: SESSION_ID,
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    currency: "usd",
    amount_total: 4500,
    livemode: false,
    metadata: { attemptId: "attempt_evidence", orderId: "order_evidence" },
    payment_intent: "pi_test_evidence",
  };

  function evidenceClient(overrides = {}) {
    return createStripeProviderClient({
      secretKey: SECRET_KEY,
      apiVersion: API_VERSION,
      now: () => OBSERVED_AT,
      fetchImpl: async () => response({ json: COMPLETED_SESSION }),
      ...overrides,
    });
  }

  function sessionClient(payload) {
    return evidenceClient({ fetchImpl: async () => response({ json: payload }) });
  }

  test("returns the completed Session as the facts the payment decision compares", async () => {
    const result = await evidenceClient().retrievePaymentEvidence({
      sessionId: SESSION_ID,
      accountId: ACCOUNT_ID,
    });

    assert.deepEqual(result, {
      source: "authenticated_server_retrieval",
      observedAt: OBSERVED_AT,
      accountId: ACCOUNT_ID,
      livemode: false,
      objectType: "checkout.session",
      objectId: SESSION_ID,
      mode: "payment",
      status: "complete",
      paymentStatus: "paid",
      currency: "usd",
      amountTotalCents: 4500,
      paymentIntentId: "pi_test_evidence",
      metadata: { attemptId: "attempt_evidence", orderId: "order_evidence" },
    });
  });

  test("escapes the session id and authenticates", async () => {
    let request;
    const client = evidenceClient({
      fetchImpl: async (url, init) => {
        request = { url: String(url), init };
        return response({ json: COMPLETED_SESSION });
      },
    });

    await client.retrievePaymentEvidence({
      sessionId: "cs_test/evidence",
      accountId: ACCOUNT_ID,
    });

    assert.equal(
      request.url,
      "https://api.stripe.com/v1/checkout/sessions/cs_test%2Fevidence",
    );
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.headers.Authorization, `Bearer ${SECRET_KEY}`);
    assert.equal(request.init.headers["Stripe-Version"], API_VERSION);
  });

  test("reads the session once, without walking its line items", async () => {
    const requests = [];
    const client = evidenceClient({
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), init });
        return response({ json: COMPLETED_SESSION });
      },
    });

    const result = await client.retrievePaymentEvidence({
      sessionId: SESSION_ID,
      accountId: ACCOUNT_ID,
    });

    assert.equal(requests.length, 1);
    assert.equal(result.amountTotalCents, 4500);
  });

  // An open Session is a real answer, not a failure: the reducer decides it does not settle
  // anything. Rejecting it here would hide a Session the buyer can still pay.
  test("reports an unfinished Session faithfully instead of judging it", async () => {
    const result = await sessionClient({
      ...COMPLETED_SESSION,
      status: "open",
      payment_status: "unpaid",
      payment_intent: null,
    }).retrievePaymentEvidence({ sessionId: SESSION_ID, accountId: ACCOUNT_ID });

    assert.equal(result.status, "open");
    assert.equal(result.paymentStatus, "unpaid");
    assert.equal(result.paymentIntentId, null);
  });

  const damagedSessions = [
    ["a Session with no id", { ...COMPLETED_SESSION, id: "" }],
    [
      "a Session total that is not a whole number of cents",
      { ...COMPLETED_SESSION, amount_total: 45.5 },
    ],
    [
      "a live-mode Session read with a test key",
      { ...COMPLETED_SESSION, livemode: true },
    ],
  ];

  for (const [description, payload] of damagedSessions) {
    test(`refuses ${description}`, async () => {
      await assert.rejects(
        sessionClient(payload).retrievePaymentEvidence({
          sessionId: SESSION_ID,
          accountId: ACCOUNT_ID,
        }),
        (error) => {
          assertSafeFailure(error.message);
          return true;
        },
      );
    });
  }

  // Without an account the evidence could not be attributed to anyone, so it is refused rather
  // than recorded against a guessed account.
  test("refuses to read evidence without an account to attribute it to", async () => {
    await assert.rejects(
      evidenceClient().retrievePaymentEvidence({ sessionId: SESSION_ID, accountId: "" }),
      (error) => {
        assertSafeFailure(error.message);
        return true;
      },
    );
  });
});

/*
 * @behavior The second opinion: read the PaymentIntent that Stripe minted alongside the Session.
 *           It can never settle a purchase on its own, so this only reports facts.
 */
describe("retrievePaymentIntentEvidence", () => {
  const ACCOUNT_ID = "acct_test_evidence";
  const OBSERVED_AT = 1_900_003_600_000;
  const SESSION_ID = "cs_test_evidence";

  const SUCCEEDED_PAYMENT_INTENT = {
    id: "pi_test_evidence",
    object: "payment_intent",
    status: "succeeded",
    amount: 4500,
    currency: "usd",
    livemode: false,
    metadata: { attemptId: "attempt_evidence", orderId: "order_evidence" },
  };

  function intentClient(overrides = {}) {
    return createStripeProviderClient({
      secretKey: SECRET_KEY,
      apiVersion: API_VERSION,
      now: () => OBSERVED_AT,
      fetchImpl: async () => response({ json: SUCCEEDED_PAYMENT_INTENT }),
      ...overrides,
    });
  }

  test("returns the PaymentIntent as the supporting facts the second opinion compares", async () => {
    const result = await intentClient().retrievePaymentIntentEvidence({
      paymentIntentId: "pi_test_evidence",
      accountId: ACCOUNT_ID,
      sessionId: SESSION_ID,
    });

    assert.deepEqual(result, {
      source: "authenticated_server_retrieval",
      observedAt: OBSERVED_AT,
      accountId: ACCOUNT_ID,
      livemode: false,
      objectType: "payment_intent",
      objectId: "pi_test_evidence",
      status: "succeeded",
      amountCents: 4500,
      currency: "usd",
      sessionId: SESSION_ID,
      metadata: { attemptId: "attempt_evidence", orderId: "order_evidence" },
    });
  });

  test("reads the PaymentIntent Stripe minted, authenticating as the account", async () => {
    let request;
    const client = intentClient({
      fetchImpl: async (url, init) => {
        request = { url: String(url), init };
        return response({ json: SUCCEEDED_PAYMENT_INTENT });
      },
    });

    await client.retrievePaymentIntentEvidence({
      paymentIntentId: "pi_test/evidence",
      accountId: ACCOUNT_ID,
      sessionId: SESSION_ID,
    });

    assert.equal(
      request.url,
      "https://api.stripe.com/v1/payment_intents/pi_test%2Fevidence",
    );
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.headers.Authorization, `Bearer ${SECRET_KEY}`);
    assert.equal(request.init.headers["Stripe-Version"], API_VERSION);
  });

  // The Session correlation never comes from Stripe - we recorded which Session we opened, so a
  // caller with no stored correlation has nothing to attach the PaymentIntent to.
  test("refuses to report a PaymentIntent with no Session correlation to attach it to", async () => {
    await assert.rejects(
      intentClient().retrievePaymentIntentEvidence({
        paymentIntentId: "pi_test_evidence",
        accountId: ACCOUNT_ID,
        sessionId: "",
      }),
      (error) => {
        assertSafeFailure(error.message);
        return true;
      },
    );
  });

  const damagedIntents = [
    ["a PaymentIntent with no id", { ...SUCCEEDED_PAYMENT_INTENT, id: "" }],
    ["a PaymentIntent with no status", { ...SUCCEEDED_PAYMENT_INTENT, status: "" }],
    ["a PaymentIntent with no amount", { ...SUCCEEDED_PAYMENT_INTENT, amount: null }],
    [
      "a PaymentIntent whose amount is not a whole number of cents",
      { ...SUCCEEDED_PAYMENT_INTENT, amount: 45.5 },
    ],
    ["a live-mode PaymentIntent read with a test key", { ...SUCCEEDED_PAYMENT_INTENT, livemode: true }],
  ];

  for (const [description, payload] of damagedIntents) {
    test(`refuses ${description}`, async () => {
      await assert.rejects(
        intentClient({ fetchImpl: async () => response({ json: payload }) })
          .retrievePaymentIntentEvidence({
            paymentIntentId: "pi_test_evidence",
            accountId: ACCOUNT_ID,
            sessionId: SESSION_ID,
          }),
        (error) => {
          assertSafeFailure(error.message);
          return true;
        },
      );
    });
  }
});
