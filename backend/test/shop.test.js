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
      assert.equal(response.body.catalog.dropId, shopCatalog.dropId);
      assert.equal(response.body.catalog.catalogVersion, shopCatalog.catalogVersion);
      assert.equal(response.body.catalog.currency, "usd");
      assert.equal(response.body.catalog.saleState, "open");
      assert.equal(response.body.catalog.items.length, 5);
      assert.equal(response.body.catalog.items[0].sku, "info-hoodie");
    } finally {
      await api.close();
    }
  });

  it("reflects saleState using the injected clock function", async () => {
    const opensMs = Date.parse(shopCatalog.opensAt);
    let mockTime = opensMs - 1000;
    let clockCallCount = 0;

    const router = createShopRouter({
      catalog: shopCatalog,
      now: () => {
        clockCallCount++;
        return mockTime;
      },
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
      assert.equal(clockCallCount, 1);

      // 2. Exact close boundary -> "closed"
      mockTime = Date.parse(shopCatalog.closesAt);
      const resClosed = await api.request("GET", "/api/v1/shop/catalog");
      assert.equal(resClosed.status, 200);
      assert.equal(resClosed.body.catalog.saleState, "closed");
      assert.equal(clockCallCount, 2);
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
      assert.equal(res.body.catalog.dropId, shopCatalog.dropId);
    } finally {
      await api.close();
    }
  });
});

describe("Shop HTTP Controller (POST /api/v1/shop/checkout)", () => {
  function makeFakeStripe({
    sessionUrl = "https://checkout.stripe.com/c/pay/cs_test_123",
    shouldThrow = false,
  } = {}) {
    const calls = [];
    return {
      calls,
      checkout: {
        sessions: {
          create: async (params) => {
            calls.push(params);
            if (shouldThrow) {
              const err = new Error("Stripe network error");
              err.type = "api_error";
              err.code = "network_failure";
              err.requestId = "req_test_123";
              throw err;
            }
            return { url: sessionUrl };
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
      returnBaseUrl: "http://localhost:3000",
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
      returnBaseUrl: "http://localhost:3000",
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
      returnBaseUrl: "http://localhost:3000",
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
      returnBaseUrl: "http://localhost:3000",
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
      assert.equal(res.body.message, "Catalog version is out of date.");
      assert.equal(fakeStripe.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("returns 503 when provider or return URL is not configured, provider throws, or url is missing", async () => {
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;
    const validPayload = {
      catalogVersion: shopCatalog.catalogVersion,
      items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
    };

    // 1. Provider not configured
    const routerNoProvider = createShopRouter({
      stripe: null,
      catalog: shopCatalog,
      now: () => openTime,
      returnBaseUrl: "http://localhost:3000",
    });
    const apiNoProvider = await makeTestApi({
      router: routerNoProvider,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123", email: "user@uw.edu" },
    });
    try {
      const res = await apiNoProvider.request("POST", "/api/v1/shop/checkout", validPayload);
      assert.equal(res.status, 503);
      assert.equal(res.body.status, "error");
    } finally {
      await apiNoProvider.close();
    }

    // 2. Return URL not configured
    const fakeStripe = makeFakeStripe();
    const routerNoUrl = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
      now: () => openTime,
      returnBaseUrl: "",
    });
    const apiNoUrl = await makeTestApi({
      router: routerNoUrl,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123", email: "user@uw.edu" },
    });
    try {
      const res = await apiNoUrl.request("POST", "/api/v1/shop/checkout", validPayload);
      assert.equal(res.status, 503);
      assert.equal(res.body.status, "error");
      assert.equal(fakeStripe.calls.length, 0);
    } finally {
      await apiNoUrl.close();
    }

    // 3. Provider throws
    const throwingStripe = makeFakeStripe({ shouldThrow: true });
    const routerThrow = createShopRouter({
      stripe: throwingStripe,
      catalog: shopCatalog,
      now: () => openTime,
      returnBaseUrl: "http://localhost:3000",
    });
    const apiThrow = await makeTestApi({
      router: routerThrow,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123", email: "user@uw.edu" },
    });
    try {
      const res = await apiThrow.request("POST", "/api/v1/shop/checkout", validPayload);
      assert.equal(res.status, 503);
      assert.equal(res.body.status, "error");
      assert.ok(!res.body.message.includes("Stripe network error"));
    } finally {
      await apiThrow.close();
    }

    // 4. Provider returns session without url
    const noUrlStripe = makeFakeStripe({ sessionUrl: null });
    const routerNullUrl = createShopRouter({
      stripe: noUrlStripe,
      catalog: shopCatalog,
      now: () => openTime,
      returnBaseUrl: "http://localhost:3000",
    });
    const apiNullUrl = await makeTestApi({
      router: routerNullUrl,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123", email: "user@uw.edu" },
    });
    try {
      const res = await apiNullUrl.request("POST", "/api/v1/shop/checkout", validPayload);
      assert.equal(res.status, 503);
      assert.equal(res.body.status, "error");
    } finally {
      await apiNullUrl.close();
    }
  });

  it("creates checkout session with exact parameters and returns hosted url on 200 success", async () => {
    const fakeStripe = makeFakeStripe({
      sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_session_123",
    });
    const openTime = Date.parse(shopCatalog.opensAt) + 7200 * 1000;

    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
      now: () => openTime,
      returnBaseUrl: "http://localhost:3000",
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: {
        isAuthenticated: true,
        userId: "user_789",
        email: "student@uw.edu",
      },
    });

    try {
      const res = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [
          { sku: "info-hoodie", size: "L", quantity: 2 },
          { sku: "info-tote-bag", size: "One Size", quantity: 1 },
        ],
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.status, "success");
      assert.equal(res.body.url, "https://checkout.stripe.com/c/pay/cs_test_session_123");

      assert.equal(fakeStripe.calls.length, 1);
      const params = fakeStripe.calls[0];

      assert.equal(params.mode, "payment");
      assert.deepEqual(params.allowed_payment_method_types, ["card"]);
      assert.deepEqual(params.phone_number_collection, { enabled: true });
      assert.equal(params.client_reference_id, "user_789");
      assert.equal(params.customer_email, "student@uw.edu");

      const expectedMetadata = {
        source: "iuga_shop",
        drop_id: shopCatalog.dropId,
        catalog_version: shopCatalog.catalogVersion,
        user_id: "user_789",
      };
      assert.deepEqual(params.metadata, expectedMetadata);
      assert.deepEqual(params.payment_intent_data, { metadata: expectedMetadata });

      assert.equal(params.success_url, "http://localhost:3000/shop?checkout=complete");
      assert.equal(params.cancel_url, "http://localhost:3000/shop?checkout=canceled");

      // Expiry check: 23 hours from nowMs
      const expectedExpiry = Math.floor((openTime + 23 * 3600 * 1000) / 1000);
      assert.equal(params.expires_at, expectedExpiry);

      // Line items check
      assert.equal(params.line_items.length, 2);
      assert.deepEqual(params.line_items[0], {
        price_data: {
          currency: "usd",
          unit_amount: 4500,
          product_data: {
            name: "INFO Hoodie (L)",
            metadata: {
              sku: "info-hoodie",
              size: "L",
            },
          },
        },
        quantity: 2,
      });
      assert.deepEqual(params.line_items[1], {
        price_data: {
          currency: "usd",
          unit_amount: 2000,
          product_data: {
            name: "INFO Tote Bag (One Size)",
            metadata: {
              sku: "info-tote-bag",
              size: "One Size",
            },
          },
        },
        quantity: 1,
      });
    } finally {
      await api.close();
    }
  });

  it("ignores client-supplied identity, prices, and totals in request body", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;

    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
      now: () => openTime,
      returnBaseUrl: "http://localhost:3000",
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: {
        isAuthenticated: true,
        userId: "trusted_server_user_id",
        email: "trusted_student@uw.edu",
      },
    });

    try {
      // Malicious attempt to spoof identity and discount price
      const res = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [
          {
            sku: "info-hoodie",
            size: "L",
            quantity: 1,
            unitAmount: 1, // Attacker tries $0.01 instead of $45.00
            price: 1,
          },
        ],
        userId: "attacker_user_id",
        email: "attacker@spoofed.com",
        total: 1,
        success_url: "https://evil.com/steal-creds",
      });

      assert.equal(res.status, 200);
      assert.equal(fakeStripe.calls.length, 1);
      const params = fakeStripe.calls[0];

      // Identity from session, NOT body
      assert.equal(params.client_reference_id, "trusted_server_user_id");
      assert.equal(params.customer_email, "trusted_student@uw.edu");
      assert.equal(params.metadata.user_id, "trusted_server_user_id");
      assert.equal(params.payment_intent_data.metadata.user_id, "trusted_server_user_id");

      // Price from catalog, NOT body
      assert.equal(params.line_items[0].price_data.unit_amount, 4500);

      // Return URLs from server config, NOT body
      assert.equal(params.success_url, "http://localhost:3000/shop?checkout=complete");
      assert.equal(params.cancel_url, "http://localhost:3000/shop?checkout=canceled");
    } finally {
      await api.close();
    }
  });

  it("omits customer_email when session email is not a non-empty string", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;

    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
      now: () => openTime,
      returnBaseUrl: "http://localhost:3000",
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: {
        isAuthenticated: true,
        userId: "user_no_email",
        email: "", // empty email in session
      },
    });

    try {
      const res = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
      });

      assert.equal(res.status, 200);
      assert.equal(fakeStripe.calls.length, 1);
      assert.equal(fakeStripe.calls[0].customer_email, undefined);
    } finally {
      await api.close();
    }
  });

  it("consolidates duplicate sku+size rows into a single line with summed quantity", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;

    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
      now: () => openTime,
      returnBaseUrl: "http://localhost:3000",
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123" },
    });

    try {
      const res = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [
          { sku: "info-hoodie", size: "L", quantity: 2 },
          { sku: "info-hoodie", size: "L", quantity: 3 },
        ],
      });

      assert.equal(res.status, 200);
      assert.equal(fakeStripe.calls.length, 1);
      const lineItems = fakeStripe.calls[0].line_items;
      assert.equal(lineItems.length, 1);
      assert.equal(lineItems[0].quantity, 5);
      assert.equal(lineItems[0].price_data.product_data.metadata.sku, "info-hoodie");
      assert.equal(lineItems[0].price_data.product_data.metadata.size, "L");
    } finally {
      await api.close();
    }
  });

  it("calls now() exactly once per request to prevent close boundary straddling", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;
    let nowInvocationCount = 0;

    const router = createShopRouter({
      stripe: fakeStripe,
      catalog: shopCatalog,
      now: () => {
        nowInvocationCount++;
        return openTime;
      },
      returnBaseUrl: "http://localhost:3000",
    });
    const api = await makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session: { isAuthenticated: true, userId: "user_123" },
    });

    try {
      const res = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
      });

      assert.equal(res.status, 200);
      assert.equal(nowInvocationCount, 1);
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

  it("returns configured Stripe client instance when STRIPE_SECRET_KEY is valid", () => {
    const client = createStripeClient({ STRIPE_SECRET_KEY: "sk_test_mock_secret_key" });
    assert.ok(client);
    assert.equal(typeof client.checkout?.sessions?.create, "function");
    assert.equal(client.getMaxNetworkRetries(), 2);
  });

  it("defaults env to process.env and does not throw at import or construction", () => {
    const client = createStripeClient();
    // process.env does not have STRIPE_SECRET_KEY in test runner -> returns null
    assert.equal(client, null);
  });
});
