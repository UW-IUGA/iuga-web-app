/*
Purpose: Prove the Stripe boundary can be trusted with a real purchase: it sends exactly the
         fields we decided, reuses our retry key so a retry cannot become a second charge,
         and every failure — bad key, dead network, Stripe rejection — comes back as one
         generic error that leaks neither our API key nor Stripe's response body.
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

// A stand-in for the fetch response Stripe would give us.
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
    // Why: these stay absent so the buyer cannot change a quantity or apply a discount we did
    //      not price, and no Stripe customer record is created for a one-off purchase.
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
});
