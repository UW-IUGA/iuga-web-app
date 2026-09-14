/*
 * @behavior Pin what this endpoint promises the browser: only a signed-in buyer can call it, it
 *           decides everything about money itself, and every answer is exactly the shape the
 *           client was told to expect — with no internal detail, retry key, or Stripe
 *           identifier leaking into a response.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createShopRouter } from "../routes/api/v1/controllers/shop.js";
import { makeTestApi } from "./testApi.js";

const OWNER = { type: "user", userId: "user-123" };
const UPPERCASE_KEY = "550E8400-E29B-41D4-A716-446655440000";
const NORMALIZED_KEY = UPPERCASE_KEY.toLowerCase();
const ITEMS = [{ skuKey: "info-hoodie", quantity: 2 }];

function fakeCheckout(result, calls) {
  return async (args) => {
    calls.push(args);
    return result;
  };
}

async function makeApi({ checkout, checkoutEnabled, session = { isAuthenticated: true, userId: OWNER.userId } } = {}) {
  return makeTestApi({
    router: createShopRouter({ checkout, checkoutEnabled }),
    mountPath: "/api/v1/shop",
    models: { injected: true },
    session,
  });
}

async function request(api, body = { items: ITEMS }, options = {}) {
  return api.request("POST", "/api/v1/shop/checkout-sessions", body, {
    headers: { "Idempotency-Key": UPPERCASE_KEY, ...options.headers },
    ...options,
  });
}

describe("POST /api/v1/shop/checkout-sessions", () => {
  test("refuses a caller who is not signed in, before any checkout work", async () => {
    const calls = [];
    const api = await makeApi({
      checkout: fakeCheckout({ status: "unavailable" }, calls),
      session: {},
    });

    try {
      const result = await request(api);

      assert.equal(result.status, 401);
      assert.deepEqual(result.body, { status: "error", message: "Not authenticated" });
      assert.equal(calls.length, 0);
    } finally {
      await api.close();
    }
  });

  test("refuses a missing or malformed retry key, before any checkout work", async () => {
    for (const key of [undefined, "not-a-uuid", "550e8400-e29b-11d4-a716-446655440000"]) {
      const calls = [];
      const api = await makeApi({ checkout: fakeCheckout({ status: "ready" }, calls) });
      try {
        const result = await api.request("POST", "/api/v1/shop/checkout-sessions", { items: ITEMS }, {
          headers: key === undefined ? {} : { "Idempotency-Key": key },
        });
        assert.equal(result.status, 400, String(key));
        assert.equal(calls.length, 0, String(key));
      } finally {
        await api.close();
      }
    }
  });

  test("refuses an unknown body field, a missing cart, a duplicate variant, and a bad quantity", async () => {
    const invalidBodies = [
      { items: ITEMS, owner: OWNER, amount: 100, price: "price_browser", url: "https://evil.example", status: "ready" },
      {},
      { items: [{ skuKey: "info-hoodie", quantity: 1 }, { skuKey: "info-hoodie", quantity: 2 }] },
      { items: [{ skuKey: "info-hoodie", quantity: 0 }] },
    ];

    for (const body of invalidBodies) {
      const calls = [];
      const api = await makeApi({ checkout: fakeCheckout({ status: "ready" }, calls) });
      try {
        const result = await request(api, body);
        assert.equal(result.status, 400);
        assert.equal(calls.length, 0);
      } finally {
        await api.close();
      }
    }
  });

  test("hands the checkout flow the session buyer and never the browser's claims", async () => {
    const calls = [];
    const checkout = fakeCheckout({
      status: "ready",
      isNew: true,
      attemptKey: NORMALIZED_KEY,
      orderReference: "ORD-123",
      checkoutUrl: "https://checkout.stripe.test/session",
      providerSessionId: "cs_test_provider",
      catalogPriceMinor: 9999,
      owner: OWNER,
      frozenStripeRequest: { line_items: [{ price: "price_browser" }] },
      internalError: new Error("secret internal error"),
    }, calls);
    const api = await makeApi({ checkout, checkoutEnabled: false });

    try {
      const result = await request(api);

      assert.equal(result.status, 201);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].owner, OWNER);
      assert.equal(calls[0].attemptKey, NORMALIZED_KEY);
      assert.deepEqual(calls[0].items, ITEMS);
      assert.equal(calls[0].checkoutEnabled, false);
      assert.equal(typeof calls[0].getProvider, "function");
      // No internal name, price, or error detail may reach the browser.
      assert.doesNotMatch(JSON.stringify(result.body), /cs_test_provider|price_\w+|user-123|frozen|internal/i);
      assert.equal(calls[0].price, undefined);
      assert.equal(calls[0].url, undefined);
      assert.equal(calls[0].status, undefined);
      assert.deepEqual(result.body, {
        attemptKey: NORMALIZED_KEY,
        orderReference: "ORD-123",
        status: "ready",
        checkoutUrl: "https://checkout.stripe.test/session",
      });
    } finally {
      await api.close();
    }
  });

  test("answers 200 with the same link when the buyer asks again", async () => {
    const calls = [];
    const api = await makeApi({
      checkout: fakeCheckout({
        status: "ready", isNew: false, attemptKey: NORMALIZED_KEY, orderReference: "ORD-123", checkoutUrl: "https://checkout.stripe.test/replay",
      }, calls),
    });

    try {
      const result = await request(api);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, {
        attemptKey: NORMALIZED_KEY,
        orderReference: "ORD-123",
        status: "ready",
        checkoutUrl: "https://checkout.stripe.test/replay",
      });
      assert.equal(calls.length, 1);
    } finally {
      await api.close();
    }
  });

  test("answers 202 without a payment link while the attempt is still in progress", async () => {
    const calls = [];
    const api = await makeApi({ checkout: fakeCheckout({ status: "pending", attemptKey: NORMALIZED_KEY, orderReference: "ORD-123" }, calls) });
    try {
      const result = await request(api);
      assert.equal(result.status, 202);
      assert.deepEqual(result.body, { attemptKey: NORMALIZED_KEY, orderReference: "ORD-123", status: "pending" });
      assert.equal(Object.hasOwn(result.body, "checkoutUrl"), false);
    } finally {
      await api.close();
    }
  });

  test("answers 202 without a payment link when a human must check Stripe", async () => {
    const calls = [];
    const api = await makeApi({
      checkout: fakeCheckout({
        status: "reconciliation_required",
        attemptKey: NORMALIZED_KEY,
        orderReference: "ORD-123",
        // Reconciliation must never publish a link, even if the flow hands one over.
        checkoutUrl: "https://checkout.stripe.test/should-not-leak",
      }, calls),
    });
    try {
      const result = await request(api);
      assert.equal(result.status, 202);
      assert.deepEqual(result.body, {
        attemptKey: NORMALIZED_KEY,
        orderReference: "ORD-123",
        status: "reconciliation_required",
      });
      assert.equal(Object.hasOwn(result.body, "checkoutUrl"), false);
      assert.equal(calls.length, 1);
    } finally {
      await api.close();
    }
  });

  test("reports a finished attempt as 200 with its status and no payment link", async () => {
    for (const status of ["expired", "failed"]) {
      const calls = [];
      const api = await makeApi({
        checkout: fakeCheckout({
          status,
          attemptKey: NORMALIZED_KEY,
          orderReference: "ORD-123",
          checkoutUrl: "https://checkout.stripe.test/should-not-leak",
        }, calls),
      });
      try {
        const result = await request(api);
        assert.equal(result.status, 200, status);
        assert.deepEqual(result.body, {
          attemptKey: NORMALIZED_KEY,
          orderReference: "ORD-123",
          status,
        });
        assert.equal(Object.hasOwn(result.body, "checkoutUrl"), false);
      } finally {
        await api.close();
      }
    }
  });

  for (const [status, httpStatus] of [["conflict", 409], ["unavailable", 503]]) {
    test(`reports ${status} as ${httpStatus} without revealing a reason`, async () => {
      const calls = [];
      const api = await makeApi({ checkout: fakeCheckout({ status }, calls) });
      try {
        const result = await request(api);
        assert.equal(result.status, httpStatus);
        assert.equal(result.body.status, "error");
        assert.equal(typeof result.body.message, "string");
        assert.doesNotMatch(JSON.stringify(result.body), /stripe|secret|price|user-123|internal error/i);
        assert.equal(calls.length, 1);
      } finally {
        await api.close();
      }
    });
  }

  test("replays a recorded attempt even while checkout is switched off", async () => {
    const calls = [];
    const checkout = async (args) => {
      calls.push(args);
      return calls.length === 1
        ? { status: "unavailable" }
        : { status: "ready", isNew: false, attemptKey: NORMALIZED_KEY, orderReference: "ORD-123", checkoutUrl: "https://checkout.stripe.test/replay" };
    };
    const api = await makeApi({ checkout });
    try {
      const first = await request(api);
      const replay = await request(api);
      assert.equal(first.status, 503);
      assert.equal(replay.status, 200);
      assert.equal(calls.length, 2);
      assert.equal(calls[0].checkoutEnabled, false);
      assert.equal(calls[1].checkoutEnabled, false);
    } finally {
      await api.close();
    }
  });

  test("refuses a signed-in session that has no usable buyer id", async () => {
    const calls = [];
    const api = await makeApi({
      checkout: fakeCheckout({ status: "ready" }, calls),
      session: { isAuthenticated: true },
    });
    try {
      const result = await request(api);
      assert.equal(result.status, 401);
      assert.deepEqual(result.body, { status: "error", message: "Not authenticated" });
      assert.equal(calls.length, 0);
    } finally {
      await api.close();
    }
  });
});
