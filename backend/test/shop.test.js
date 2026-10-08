import assert from "node:assert/strict";
import { describe, it } from "node:test";
import apiv1Router from "../routes/api/v1/apiv1.js";
import { createShopRouter } from "../routes/api/v1/controllers/shop.js";
import { shopCatalog } from "../routes/api/v1/utils/shopCatalog.js";
import { createStripeClient } from "../routes/api/v1/utils/stripeClient.js";
import { makeTestApi } from "./testApi.js";

describe("Shop HTTP Controller (GET /api/v1/shop/catalog)", () => {
  it("returns 200 with success envelope and requires no session", async () => {
    const fixedNow = Date.parse(shopCatalog.opensAt) + 3600 * 1000;
    const router = createShopRouter({
      catalog: shopCatalog,
      now: () => fixedNow,
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: false },
    });

    try {
      const response = await api.request("GET", "/api/v1/shop/catalog");
      assert.equal(response.status, 200);
      assert.equal(response.body.status, "success");
      assert.ok(response.body.catalog);
      assert.equal(response.body.catalog.catalogId, shopCatalog.catalogId);
      assert.equal(Object.hasOwn(response.body.catalog, "dropId"), false);
      assert.equal(response.body.catalog.catalogVersion, shopCatalog.catalogVersion);
      assert.equal(response.body.catalog.catalogVersion, "fall-2026-v1");
      assert.equal(response.body.catalog.currency, "usd");
      assert.equal(response.body.catalog.saleState, "open");
      assert.ok(response.body.catalog.items.length > 0);
      assert.deepEqual(Object.fromEntries(
        response.body.catalog.items.map(({ sku, unitPriceCents }) => [sku, unitPriceCents]),
      ), {
        "info-hoodie": 3200,
        "info-crewneck": 3000,
        "info-baseball-tee": 2200,
        "info-t-shirt": 2400,
        "info-tote-bag": 2000,
      });
      for (const item of response.body.catalog.items) {
        assert.equal(typeof item.sku, "string");
        assert.ok(item.sku.length > 0);
        assert.ok(Number.isSafeInteger(item.unitPriceCents) && item.unitPriceCents > 0);
      }
      assert.equal(Object.hasOwn(response.body.catalog.items[0], "unitAmount"), false);
    } finally {
      await api.close();
    }
  });

  it("reflects saleState using the injected clock function", async () => {
    const opensMs = Date.parse(shopCatalog.opensAt);
    let mockTime = opensMs - 1000;

    const router = createShopRouter({
      catalog: shopCatalog,
      now: () => mockTime,
    });

    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
    });

    try {
      // 1. Before sale opens -> "scheduled"
      const resBefore = await api.request("GET", "/api/v1/shop/catalog");
      assert.equal(resBefore.status, 200);
      assert.equal(resBefore.body.catalog.saleState, "scheduled");

      // 2. Exact close boundary -> "closed"
      mockTime = Date.parse(shopCatalog.closesAt);
      const resClosed = await api.request("GET", "/api/v1/shop/catalog");
      assert.equal(resClosed.status, 200);
      assert.equal(resClosed.body.catalog.saleState, "closed");
    } finally {
      await api.close();
    }
  });

  it("is mounted on apiv1 router at /shop/catalog", async () => {
    const api = await makeTestApi({
      router: apiv1Router,
      mountPath: "/api/v1",
      models: {},
    });

    try {
      const res = await api.request("GET", "/api/v1/shop/catalog");
      assert.equal(res.status, 200);
      assert.equal(res.body.status, "success");
      assert.equal(res.body.catalog.catalogId, shopCatalog.catalogId);
    } finally {
      await api.close();
    }
  });
});

describe("Shop HTTP Controller (GET /api/v1/shop/checkout/:sessionId)", () => {
  const sessionId = "cs_test_paid123";
  const paidSession = {
    id: sessionId,
    status: "complete",
    payment_status: "paid",
    mode: "payment",
    client_reference_id: "user_123",
    metadata: { source: "iuga_shop", user_id: "user_123", drop_id: shopCatalog.catalogId },
  };

  async function requestStatus({ session = paidSession, userId = "user_123", retrieveError } = {}) {
    const requests = [];
    const stripe = { checkout: { sessions: { retrieve: async (id) => {
      requests.push(id);
      if (retrieveError) throw retrieveError;
      return session;
    } } } };
    const router = createShopRouter({ stripe, catalog: shopCatalog });
    const api = await makeTestApi({
      router, mountPath: "/api/v1/shop", models: {},
      session: { isAuthenticated: Boolean(userId), userId },
    });
    try {
      const response = await api.request("GET", `/api/v1/shop/checkout/${sessionId}`);
      return { response, requests };
    } finally {
      await api.close();
    }
  }

  it("reports paid only when Stripe confirms this user's completed payment", async () => {
    const { response, requests } = await requestStatus();
    assert.equal(response.status, 200);
    assert.equal(response.body.paymentStatus, "paid");
    assert.deepEqual(requests, [sessionId]);
  });

  it("does not confirm an unpaid or incomplete checkout", async () => {
    for (const session of [
      { ...paidSession, payment_status: "unpaid" },
      { ...paidSession, status: "open" },
    ]) {
      const { response } = await requestStatus({ session });
      assert.equal(response.status, 200);
      assert.equal(response.body.paymentStatus, "pending");
    }
  });

  it("does not expose another customer's session or treat a foreign payment as this shop's", async () => {
    for (const session of [
      { ...paidSession, client_reference_id: "other" },
      { ...paidSession, metadata: { ...paidSession.metadata, source: "other" } },
      { ...paidSession, metadata: { ...paidSession.metadata, drop_id: "other" } },
    ]) {
      const { response } = await requestStatus({ session });
      assert.equal(response.status, 404);
    }
  });

  it("requires login and fails clearly when Stripe cannot confirm", async () => {
    const unauthenticated = await requestStatus({ userId: null });
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(unauthenticated.requests.length, 0);
    const unavailable = await requestStatus({ retrieveError: new Error("Stripe unavailable") });
    assert.equal(unavailable.response.status, 503);
  });

  it("returns 404 instead of 503 when Stripe reports the session does not exist", async () => {
    const notFound = new Error("No such checkout session");
    notFound.type = "invalid_request_error";
    notFound.code = "resource_missing";
    const { response } = await requestStatus({ retrieveError: notFound });
    assert.equal(response.status, 404);
  });
});

describe("Shop HTTP Controller (POST /api/v1/shop/checkout)", () => {
  function makeFakeStripe() {
    const calls = [];
    return {
      calls,
      checkout: {
        sessions: {
          create: async (params) => {
            calls.push(params);
          },
        },
      },
    };
  }

  it("returns 401 for an unauthenticated request and makes no provider call", async () => {
    const fakeStripe = makeFakeStripe();
    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: false },
    });

    try {
      const response = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
      });
      assert.equal(response.status, 401);
      assert.equal(response.body.status, "error");
      assert.equal(response.body.message, "Not authenticated");
      assert.equal(fakeStripe.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("returns 400 for malformed bodies, missing/invalid catalogVersion, and invalid cart items", async () => {
    const fakeStripe = makeFakeStripe();
    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123", email: "user@uw.edu" },
    });

    const invalidBodies = [
      // missing catalogVersion
      { items: [{ sku: "info-hoodie", size: "L", quantity: 1 }] },
      // non-string catalogVersion
      { catalogVersion: 12345, items: [{ sku: "info-hoodie", size: "L", quantity: 1 }] },
      // non-array items
      { catalogVersion: shopCatalog.catalogVersion, items: "not-an-array" },
      // empty items
      { catalogVersion: shopCatalog.catalogVersion, items: [] },
      // string quantity
      { catalogVersion: shopCatalog.catalogVersion, items: [{ sku: "info-hoodie", size: "L", quantity: "1" }] },
      // fractional quantity
      { catalogVersion: shopCatalog.catalogVersion, items: [{ sku: "info-hoodie", size: "L", quantity: 1.5 }] },
      // zero quantity
      { catalogVersion: shopCatalog.catalogVersion, items: [{ sku: "info-hoodie", size: "L", quantity: 0 }] },
      // negative quantity
      { catalogVersion: shopCatalog.catalogVersion, items: [{ sku: "info-hoodie", size: "L", quantity: -2 }] },
      // unknown sku
      { catalogVersion: shopCatalog.catalogVersion, items: [{ sku: "nonexistent-sku", size: "L", quantity: 1 }] },
      // size not offered
      { catalogVersion: shopCatalog.catalogVersion, items: [{ sku: "info-tote-bag", size: "XL", quantity: 1 }] },
    ];

    try {
      for (const body of invalidBodies) {
        const res = await api.request("POST", "/api/v1/shop/checkout", body);
        assert.equal(res.status, 400, `Expected 400 for payload: ${JSON.stringify(body)}`);
        assert.equal(res.body.status, "error");
        assert.ok(typeof res.body.message === "string" && res.body.message.length > 0);
      }
      assert.equal(fakeStripe.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("returns 409 for stale catalogVersion, closed sale, or sale not yet open", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;
    let currentTime = openTime;

    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
      now: () => currentTime,
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123", email: "user@uw.edu" },
    });

    try {
      // 1. Stale catalogVersion
      const resStale = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: "old-version",
        items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
      });
      assert.equal(resStale.status, 409);
      assert.equal(resStale.body.status, "error");
      assert.ok(resStale.body.message.length > 0);
      assert.equal(fakeStripe.calls.length, 0);

      // 2. Sale scheduled (not open yet)
      currentTime = Date.parse(shopCatalog.opensAt) - 1000;
      const resScheduled = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
      });
      assert.equal(resScheduled.status, 409);
      assert.equal(resScheduled.body.status, "error");
      assert.equal(fakeStripe.calls.length, 0);

      // 3. Sale closed
      currentTime = Date.parse(shopCatalog.closesAt) + 1000;
      const resClosed = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
      });
      assert.equal(resClosed.status, 409);
      assert.equal(resClosed.body.status, "error");
      assert.equal(fakeStripe.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("prioritizes stale catalogVersion (409) over cart item validation (400)", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;

    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
      now: () => openTime,
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123", email: "user@uw.edu" },
    });

    try {
      // Stale catalogVersion submitted with an invalid SKU and bad quantity
      const res = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: "stale-drop-v0",
        items: [{ sku: "nonexistent-sku", size: "L", quantity: -1 }],
      });
      assert.equal(res.status, 409);
      assert.equal(res.body.status, "error");
      assert.ok(res.body.message.length > 0);
      assert.equal(fakeStripe.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("returns a checkout-unavailable response for a valid cart without creating a Stripe session", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;
    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
      now: () => openTime,
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123" },
    });

    try {
      const response = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
      });

      assert.equal(response.status, 503);
      assert.equal(response.body.status, "error");
      assert.equal(response.body.message, "Online checkout is temporarily unavailable. Your cart has not changed; please check back later.");
      assert.equal(fakeStripe.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("is mounted on apiv1 router at /shop/checkout and protects the endpoint", async () => {
    const api = await makeTestApi({
      router: apiv1Router,
      mountPath: "/api/v1",
      models: {},
      session: { isAuthenticated: false },
    });

    try {
      const res = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.status, "error");
    } finally {
      await api.close();
    }
  });
});

describe("Stripe Client Factory (createStripeClient)", () => {
  it("returns null when STRIPE_SECRET_KEY is missing, empty, whitespace, or non-string", () => {
    assert.equal(createStripeClient({}), null);
    assert.equal(createStripeClient({ STRIPE_SECRET_KEY: "" }), null);
    assert.equal(createStripeClient({ STRIPE_SECRET_KEY: "   " }), null);
    assert.equal(createStripeClient({ STRIPE_SECRET_KEY: null }), null);
    assert.equal(createStripeClient({ STRIPE_SECRET_KEY: 12345 }), null);
  });

  it("returns a Stripe client for verifying legacy sessions when the key is valid", () => {
    const client = createStripeClient({ STRIPE_SECRET_KEY: "sk_test_mock_secret_key" });
    assert.ok(client);
    assert.equal(typeof client.checkout?.sessions?.retrieve, "function");
  });

  it("defaults env to process.env and does not throw at import or construction", () => {
    const client = createStripeClient();
    // process.env does not have STRIPE_SECRET_KEY in test runner -> returns null
    assert.equal(client, null);
  });
});
