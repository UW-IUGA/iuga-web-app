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
      assert.equal(response.body.catalog.currency, "usd");
      assert.equal(response.body.catalog.saleState, "open");
      assert.ok(response.body.catalog.items.length > 0);
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

  it("reports the confirmed student amounts for each product", async () => {
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
      const amounts = Object.fromEntries(
        response.body.catalog.items.map((item) => [item.sku, item.unitPriceCents])
      );
      assert.deepEqual(amounts, {
        "info-baseball-tee": 2200,
        "info-crewneck": 3000,
        "info-hoodie": 3200,
        "info-t-shirt": 2400,
        "info-tote-bag": 2000,
      });
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
            return { id: "cs_test_session_123", url: sessionUrl };
          },
        },
      },
    };
  }

  // Omitting stripeCheckoutExposed keeps checkout closed, as in production;
  // tests that exercise the provider path must opt in explicitly.
  function makeCheckoutApi({
    stripe,
    now,
    returnBaseUrl = "http://localhost:3000",
    stripeCheckoutExposed,
    session = { isAuthenticated: true, userId: "user_123", email: "user@uw.edu" },
  }) {
    const router = createShopRouter({
      stripe,
      stripeCheckoutExposed,
      catalog: shopCatalog,
      now,
      returnBaseUrl,
    });
    return makeTestApi({
      router,
      mountPath: "/api/v1/shop",
      models: {},
      session,
    });
  }

  it("returns 401 for an unauthenticated request and makes no provider call", async () => {
    const fakeStripe = makeFakeStripe();
    const api = await makeCheckoutApi({
      stripe: fakeStripe,
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
    const api = await makeCheckoutApi({ stripe: fakeStripe });

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

    const api = await makeCheckoutApi({
      stripe: fakeStripe,
      now: () => currentTime,
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

    const api = await makeCheckoutApi({
      stripe: fakeStripe,
      now: () => openTime,
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

  it("returns 503 when provider or return URL is not configured, provider throws, or url is missing", async () => {
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;
    const validPayload = {
      catalogVersion: shopCatalog.catalogVersion,
      items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
    };

    // 1. Provider not configured
    const apiNoProvider = await makeCheckoutApi({
      stripe: null,
      stripeCheckoutExposed: true,
      now: () => openTime,
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
    const apiNoUrl = await makeCheckoutApi({
      stripe: fakeStripe,
      stripeCheckoutExposed: true,
      now: () => openTime,
      returnBaseUrl: "",
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
    const apiThrow = await makeCheckoutApi({
      stripe: throwingStripe,
      stripeCheckoutExposed: true,
      now: () => openTime,
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
    const apiNullUrl = await makeCheckoutApi({
      stripe: noUrlStripe,
      stripeCheckoutExposed: true,
      now: () => openTime,
    });
    try {
      const res = await apiNullUrl.request("POST", "/api/v1/shop/checkout", validPayload);
      assert.equal(res.status, 503);
      assert.equal(res.body.status, "error");
    } finally {
      await apiNullUrl.close();
    }
  });

  it("returns 503 and makes no provider call by default, even for a valid authenticated cart", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;
    const api = await makeCheckoutApi({
      stripe: fakeStripe,
      now: () => openTime,
    });

    try {
      const response = await api.request("POST", "/api/v1/shop/checkout", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
      });
      assert.equal(response.status, 503);
      assert.equal(response.body.status, "error");
      assert.equal(
        response.body.message,
        "Online checkout is temporarily unavailable. Your cart has not changed; please check back later."
      );
      assert.equal(fakeStripe.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("keeps checkout closed unless stripeCheckoutExposed is exactly true, so config strings like \"false\" or \"0\" cannot reopen it", async () => {
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;
    for (const stripeCheckoutExposed of ["false", "0", null]) {
      const fakeStripe = makeFakeStripe();
      const api = await makeCheckoutApi({
        stripe: fakeStripe,
        stripeCheckoutExposed,
        now: () => openTime,
      });

      try {
        const response = await api.request("POST", "/api/v1/shop/checkout", {
          catalogVersion: shopCatalog.catalogVersion,
          items: [{ sku: "info-hoodie", size: "L", quantity: 1 }],
        });
        assert.equal(response.status, 503, `Expected 503 for stripeCheckoutExposed=${JSON.stringify(stripeCheckoutExposed)}`);
        assert.equal(fakeStripe.calls.length, 0, `No provider call for stripeCheckoutExposed=${JSON.stringify(stripeCheckoutExposed)}`);
      } finally {
        await api.close();
      }
    }
  });

  it("creates a payment session bound to the user with catalog prices and return urls", async () => {
    const fakeStripe = makeFakeStripe({
      sessionUrl: "https://checkout.stripe.com/c/pay/cs_test_session_123",
    });
    const openTime = Date.parse(shopCatalog.opensAt) + 7200 * 1000;

    const api = await makeCheckoutApi({
      stripe: fakeStripe,
      stripeCheckoutExposed: true,
      now: () => openTime,
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
      assert.equal(res.body.sessionId, "cs_test_session_123");

      assert.equal(fakeStripe.calls.length, 1);
      const params = fakeStripe.calls[0];

      assert.equal(params.mode, "payment");
      assert.equal(params.client_reference_id, "user_789");
      assert.equal(params.customer_email, "student@uw.edu");

      const expectedMetadata = {
        source: "iuga_shop",
        drop_id: shopCatalog.catalogId,
        catalog_version: shopCatalog.catalogVersion,
        user_id: "user_789",
      };
      assert.deepEqual(params.metadata, expectedMetadata);

      assert.equal(params.success_url, "http://localhost:3000/shop?checkout=complete&session_id={CHECKOUT_SESSION_ID}");
      assert.equal(params.cancel_url, "http://localhost:3000/shop?checkout=canceled");

      // Line items carry catalog prices and quantities, keyed by sku
      assert.equal(params.line_items.length, 2);
      assert.equal(params.line_items[0].price_data.unit_amount, 3200);
      assert.equal(params.line_items[0].quantity, 2);
      assert.equal(params.line_items[0].price_data.product_data.metadata.sku, "info-hoodie");
      assert.equal(params.line_items[1].price_data.unit_amount, 2000);
      assert.equal(params.line_items[1].quantity, 1);
      assert.equal(params.line_items[1].price_data.product_data.metadata.sku, "info-tote-bag");
    } finally {
      await api.close();
    }
  });

  it("ignores client-supplied identity, prices, and totals in request body", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;

    const api = await makeCheckoutApi({
      stripe: fakeStripe,
      stripeCheckoutExposed: true,
      now: () => openTime,
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
            unitPriceCents: 1, // Attacker tries $0.01 instead of $45.00
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
      assert.equal(params.line_items[0].price_data.unit_amount, 3200);

      // Return URLs from server config, NOT body
      assert.equal(params.success_url, "http://localhost:3000/shop?checkout=complete&session_id={CHECKOUT_SESSION_ID}");
      assert.equal(params.cancel_url, "http://localhost:3000/shop?checkout=canceled");
    } finally {
      await api.close();
    }
  });

  it("omits customer_email when session email is not a non-empty string", async () => {
    const fakeStripe = makeFakeStripe();
    const openTime = Date.parse(shopCatalog.opensAt) + 3600 * 1000;

    const api = await makeCheckoutApi({
      stripe: fakeStripe,
      stripeCheckoutExposed: true,
      now: () => openTime,
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

    const api = await makeCheckoutApi({
      stripe: fakeStripe,
      stripeCheckoutExposed: true,
      now: () => openTime,
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
  });

  it("defaults env to process.env and does not throw at import or construction", () => {
    const client = createStripeClient();
    // process.env does not have STRIPE_SECRET_KEY in test runner -> returns null
    assert.equal(client, null);
  });
});
