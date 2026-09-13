/*
 * @behavior Pin the fail-closed rule: checkout is switched on only when the configuration, the
 *           infrastructure, and the club's approvals are all present, and every missing piece
 *           is named in the answer.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateCheckoutReadiness } from "../checkoutReadiness.js";

const VALID_ENV = Object.freeze({
  STRIPE_MODE: "test",
  STRIPE_SECRET_KEY: "sk_test_redacted_fixture",
  STRIPE_WEBHOOK_SECRET: "whsec_redacted_fixture",
  STRIPE_API_VERSION: "2025-03-31.basil",
  STRIPE_BASE_URL: "https://iuga.info",
  STRIPE_CATALOG_VERSION: "catalog-2026-09",
  STRIPE_PAYMENT_METHODS: ["card"],
  STRIPE_CURRENCY: "usd",
  STRIPE_MINIMUM_TOTAL_MINOR: 1,
});

const HEALTHY_INFRASTRUCTURE = Object.freeze({
  databaseTransactions: true,
  sessionStore: true,
  worker: true,
});

const APPROVED_POLICY = Object.freeze({
  identity: true,
  csrf: true,
  tax: true,
  fulfillment: true,
  gateA: true,
  gateB: true,
});


function evaluate(overrides = {}) {
  return evaluateCheckoutReadiness({
    env: { ...VALID_ENV, ...(overrides.env ?? {}) },
    infrastructure: { ...HEALTHY_INFRASTRUCTURE, ...(overrides.infrastructure ?? {}) },
    policy: { ...APPROVED_POLICY, ...(overrides.policy ?? {}) },
  });
}

function assertUnavailable(result, reason) {
  assert.equal(result.checkoutEnabled, false);
  assert.ok(result.reasons.includes(reason), `expected reason ${reason}`);
}

describe("checkout configuration and readiness", () => {
  it("fails closed when required configuration is missing", () => {
    const result = evaluate({
      env: {
        STRIPE_SECRET_KEY: "",
        STRIPE_WEBHOOK_SECRET: undefined,
        STRIPE_API_VERSION: undefined,
        STRIPE_BASE_URL: undefined,
        STRIPE_CATALOG_VERSION: undefined,
      },
    });

    assertUnavailable(result, "missing_configuration");
  });

  it("accepts a complete test-mode configuration when every gate is explicitly healthy", () => {
    const result = evaluate();

    assert.equal(result.checkoutEnabled, true);
    assert.equal(result.mode, "test");
    assert.deepEqual(result.reasons, []);
  });

  it("keeps live mode unavailable unless live payments are explicitly enabled", () => {
    const result = evaluate({
      env: { STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_live_redacted_fixture" },
      policy: { livePayments: false },
    });

    assertUnavailable(result, "live_mode_disabled");
    assert.equal(result.mode, "live");
  });

  it("rejects credentials that do not match the configured mode", () => {
    const cases = [
      [{ STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_live_redacted_fixture" }, {}],
      [
        { STRIPE_MODE: "live", STRIPE_SECRET_KEY: "sk_test_redacted_fixture" },
        { livePayments: true },
      ],
      [{ STRIPE_SECRET_KEY: "sk_test_" }, {}],
    ];

    for (const [env, policy] of cases) {
      const result = evaluate({ env, policy });

      assertUnavailable(result, "mode_credentials_mismatch");
    }
  });

  it("requires a pinned Stripe API version", () => {
    for (const apiVersion of ["", "latest", "2025-03", "2025-03-31", "2025-99-99.basil", "2025-02-30.basil"]) {
      const result = evaluate({ env: { STRIPE_API_VERSION: apiVersion } });

      assertUnavailable(result, "invalid_api_version");
    }
  });

  it("requires an absolute HTTPS base URL", () => {
    for (const baseUrl of ["iuga.info", "http://iuga.info", "https://", "javascript:alert(1)", "https://iuga.info/shop", "https://iuga.info?next=shop", "https://iuga.info#shop"]) {
      const result = evaluate({ env: { STRIPE_BASE_URL: baseUrl } });

      assertUnavailable(result, "invalid_base_url");
    }
  });

  it("enforces the card-only USD positive-total baseline", () => {
    const cases = [
      [{ STRIPE_PAYMENT_METHODS: ["card", "link"] }, "card_only_required"],
      [{ STRIPE_PAYMENT_METHODS: ["link"] }, "card_only_required"],
      [{ STRIPE_PAYMENT_METHODS: "card," }, "card_only_required"],
      [{ STRIPE_CURRENCY: "eur" }, "usd_required"],
      [{ STRIPE_MINIMUM_TOTAL_MINOR: 0 }, "positive_total_required"],
      [{ STRIPE_MINIMUM_TOTAL_MINOR: -1 }, "positive_total_required"],
      [{ STRIPE_MINIMUM_TOTAL_MINOR: 0.5 }, "positive_total_required"],
      [{ STRIPE_MINIMUM_TOTAL_MINOR: true }, "positive_total_required"],
      [{ STRIPE_MINIMUM_TOTAL_MINOR: [1] }, "positive_total_required"],
      [{ STRIPE_MINIMUM_TOTAL_MINOR: "1.0" }, "positive_total_required"],
    ];

    for (const [env, reason] of cases) {
      const result = evaluate({ env });

      assertUnavailable(result, reason);
    }
  });

  it("returns redacted diagnostics rather than configuration values", () => {
    const secret = "sk_test_super_secret_fixture";
    const webhookSecret = "whsec_super_secret_fixture";
    const result = evaluate({
      env: {
        STRIPE_SECRET_KEY: secret,
        STRIPE_WEBHOOK_SECRET: webhookSecret,
        STRIPE_API_VERSION: "latest",
      },
    });

    assertUnavailable(result, "invalid_api_version");
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, new RegExp(secret, "u"));
    assert.doesNotMatch(serialized, new RegExp(webhookSecret, "u"));
    assert.equal(result.diagnostics.secretKey, "[redacted]");
    assert.equal(result.diagnostics.webhookSecret, "[redacted]");
  });

  it("requires explicit infrastructure and policy gates", () => {
    const infrastructure = {
      databaseTransactions: false,
      sessionStore: false,
      worker: false,
    };
    const policy = {
      identity: false,
      csrf: false,
      tax: false,
      fulfillment: false,
      gateA: false,
      gateB: false,
    };
    const result = evaluate({ infrastructure, policy });

    assertUnavailable(result, "infrastructure_unhealthy");
    assertUnavailable(result, "policy_unapproved");
  });

});
