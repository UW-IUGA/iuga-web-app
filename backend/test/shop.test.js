import assert from "node:assert/strict";
import { describe, it } from "node:test";
import apiv1Router from "../routes/api/v1/apiv1.js";
import { createShopRouter } from "../routes/api/v1/controllers/shop.js";
import { shopCatalog } from "../routes/api/v1/utils/shopCatalog.js";
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
