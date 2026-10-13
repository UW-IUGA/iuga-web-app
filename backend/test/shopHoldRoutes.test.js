import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { createShopRouter } from "../routes/api/v1/controllers/shop.js";
import { ShopHoldError } from "../routes/api/v1/utils/shopCheckoutStore.js";
import { shopCatalog } from "../routes/api/v1/utils/shopCatalog.js";
import { makeTestApi } from "./testApi.js";

const USER_ID = "64b0000000000000000000aa";
const HOLD_ID = "64b000000000000000000001";
const PURCHASE_ID = "64b0000000000000000000ff";
const OPEN_MS = Date.parse(shopCatalog.opensAt) + 3600 * 1000;
const DEADLINE_MS = OPEN_MS + 15 * 60 * 1000;
const CART = [{ sku: "info-hoodie", size: "M", quantity: 2 }];

function storedHold(overrides = {}) {
  return {
    _id: HOLD_ID,
    userId: USER_ID,
    catalogId: shopCatalog.catalogId,
    catalogVersion: shopCatalog.catalogVersion,
    status: "active",
    expiresAt: new Date(DEADLINE_MS),
    lines: [{ sku: "info-hoodie", name: "Hoodie", size: "M", quantity: 2, unitPriceCents: 3200 }],
    ...overrides,
  };
}

function storedPurchase(overrides = {}) {
  return {
    _id: PURCHASE_ID,
    status: "pending",
    venmoUsername: "jane.doe",
    totalCents: 6400,
    confirmedAt: new Date(OPEN_MS),
    ...overrides,
  };
}

// Records every store call. Each method returns its entry in `results`; a ShopHoldError or Error is thrown.
function fakeStore(results = {}) {
  const calls = [];
  const defaults = {
    createHold: storedHold(),
    getHold: storedHold(),
    cancelHold: storedHold({ status: "cancelled" }),
    removeLineFromHold: storedHold(),
    confirmHold: storedPurchase(),
    findSavedVenmoUsername: null,
    findCheckoutSettings: { newCheckoutsPaused: false, maintenanceAtMs: null },
  };
  const merged = { ...defaults, ...results };
  const method = (name) => async (_models, args) => {
    calls.push({ name, args });
    const result = merged[name];
    if (result instanceof Error) {
      throw result;
    }
    return result;
  };
  return {
    calls,
    createHold: method("createHold"),
    getHold: method("getHold"),
    cancelHold: method("cancelHold"),
    removeLineFromHold: method("removeLineFromHold"),
    confirmHold: method("confirmHold"),
    findSavedVenmoUsername: method("findSavedVenmoUsername"),
    findCheckoutSettings: async () => merged.findCheckoutSettings,
  };
}

async function setup({
  manualCheckoutExposed = true,
  store = fakeStore(),
  session = { isAuthenticated: true, userId: USER_ID },
  nowMs = OPEN_MS,
} = {}) {
  const router = createShopRouter({
    catalog: shopCatalog,
    now: () => nowMs,
    manualCheckoutExposed,
    checkoutStore: store,
  });
  const api = await makeTestApi({
    router,
    mountPath: "/api/v1/shop",
    models: {},
    session,
  });
  return { api, store };
}

afterEach(() => {
  mock.restoreAll();
});

describe("manual checkout gate", () => {
  it("returns 503 on every hold route, without calling the store, while manualCheckoutExposed is off", async () => {
    const { api, store } = await setup({ manualCheckoutExposed: false });
    try {
      const requests = [
        ["POST", "/api/v1/shop/holds", { catalogVersion: shopCatalog.catalogVersion, items: CART }],
        ["GET", `/api/v1/shop/holds/${HOLD_ID}`, undefined],
        ["DELETE", `/api/v1/shop/holds/${HOLD_ID}`, undefined],
        ["PATCH", `/api/v1/shop/holds/${HOLD_ID}/lines`, { sku: "info-hoodie", size: "M" }],
        ["POST", `/api/v1/shop/holds/${HOLD_ID}/confirm`, { venmoUsername: "jane.doe", phoneNumber: "2065550123" }],
      ];
      for (const [method, path, body] of requests) {
        const response = await api.request(method, path, body);
        assert.equal(response.status, 503, `${method} ${path}`);
      }
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("refuses a new hold while checkouts are paused, and still lets an existing hold be confirmed", async () => {
    const { api, store } = await setup({
      store: fakeStore({ findCheckoutSettings: { newCheckoutsPaused: true, maintenanceAtMs: null } }),
    });
    try {
      const refused = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: shopCatalog.catalogVersion,
        items: CART,
      });
      assert.equal(refused.status, 503);
      assert.match(refused.body.message, /Checkout is paused for a few minutes/);
      assert.equal(store.calls.length, 0, "a paused checkout must not reserve anything");

      const confirmed = await api.request("POST", `/api/v1/shop/holds/${HOLD_ID}/confirm`, {
        venmoUsername: "jane.doe",
        phoneNumber: "2065550123",
      });
      assert.equal(confirmed.status, 200);
      assert.equal(store.calls[0].name, "confirmHold");
    } finally {
      await api.close();
    }
  });

  it("announces an upcoming maintenance time and ends new holds no later than it", async () => {
    const maintenanceAtMs = OPEN_MS + 5 * 60 * 1000;
    const { api, store } = await setup({
      store: fakeStore({ findCheckoutSettings: { newCheckoutsPaused: false, maintenanceAtMs } }),
    });
    try {
      const status = await api.request("GET", "/api/v1/shop/status");
      assert.equal(status.status, 200);
      assert.deepEqual(status.body.shop, {
        checkoutPaused: false,
        maintenanceAt: new Date(maintenanceAtMs).toISOString(),
      });

      const created = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: shopCatalog.catalogVersion,
        items: CART,
      });
      assert.equal(created.status, 200);
      assert.equal(store.calls[0].name, "createHold");
      assert.equal(store.calls[0].args.maintenanceAtMs, maintenanceAtMs);
    } finally {
      await api.close();
    }
  });

  it("stops new holds once the maintenance time arrives", async () => {
    const { api, store } = await setup({
      store: fakeStore({ findCheckoutSettings: { newCheckoutsPaused: false, maintenanceAtMs: OPEN_MS } }),
    });
    try {
      const status = await api.request("GET", "/api/v1/shop/status");
      assert.deepEqual(status.body.shop, { checkoutPaused: true, maintenanceAt: null });

      const refused = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: shopCatalog.catalogVersion,
        items: CART,
      });
      assert.equal(refused.status, 503);
      assert.match(refused.body.message, /Checkout is paused for a few minutes/);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("reports nothing to warn about where checkout is not offered", async () => {
    const { api } = await setup({
      manualCheckoutExposed: false,
      store: fakeStore({ findCheckoutSettings: { newCheckoutsPaused: true, maintenanceAtMs: OPEN_MS + 60_000 } }),
    });
    try {
      const status = await api.request("GET", "/api/v1/shop/status");
      assert.equal(status.status, 200);
      assert.deepEqual(status.body.shop, { checkoutPaused: false, maintenanceAt: null });
    } finally {
      await api.close();
    }
  });

  it("keeps checkout closed unless manualCheckoutExposed is exactly true", async () => {
    const { api, store } = await setup({ manualCheckoutExposed: "true" });
    try {
      const response = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: shopCatalog.catalogVersion,
        items: CART,
      });
      assert.equal(response.status, 503);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("requires a signed-in student before any hold route", async () => {
    const { api, store } = await setup({ session: { isAuthenticated: false } });
    try {
      const response = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: shopCatalog.catalogVersion,
        items: CART,
      });
      assert.equal(response.status, 401);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });
});

describe("POST /api/v1/shop/holds", () => {
  it("holds the cart for the signed-in student and returns the hold with its total", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: shopCatalog.catalogVersion,
        items: CART,
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.status, "success");
      assert.equal(response.body.hold.id, HOLD_ID);
      assert.equal(response.body.hold.status, "active");
      assert.equal(response.body.hold.expiresAt, new Date(DEADLINE_MS).toISOString());
      assert.equal(response.body.hold.totalCents, 6400);

      assert.equal(store.calls.length, 1);
      assert.equal(store.calls[0].name, "createHold");
      assert.equal(store.calls[0].args.userId, USER_ID);
      assert.equal(store.calls[0].args.catalogId, shopCatalog.catalogId);
      assert.equal(store.calls[0].args.catalogVersion, shopCatalog.catalogVersion);
      assert.equal(store.calls[0].args.nowMs, OPEN_MS);
      assert.deepEqual(store.calls[0].args.lines, [
        { sku: "info-hoodie", name: "Hoodie", size: "M", quantity: 2, unitPriceCents: 3200 },
      ]);
    } finally {
      await api.close();
    }
  });

  it("rejects a non-object body without calling the store", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("POST", "/api/v1/shop/holds", []);
      assert.equal(response.status, 400);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("rejects a missing catalogVersion", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("POST", "/api/v1/shop/holds", { items: CART });
      assert.equal(response.status, 400);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("rejects a stale catalogVersion with 409", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: "fall-2025-v0",
        items: CART,
      });
      assert.equal(response.status, 409);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("rejects holds before the sale opens and after it closes", async () => {
    for (const nowMs of [Date.parse(shopCatalog.opensAt) - 1000, Date.parse(shopCatalog.closesAt) + 1]) {
      const { api, store } = await setup({ nowMs });
      try {
        const response = await api.request("POST", "/api/v1/shop/holds", {
          catalogVersion: shopCatalog.catalogVersion,
          items: CART,
        });
        assert.equal(response.status, 409);
        assert.equal(store.calls.length, 0);
      } finally {
        await api.close();
      }
    }
  });

  it("rejects an invalid cart with 400", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: shopCatalog.catalogVersion,
        items: [],
      });
      assert.equal(response.status, 400);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("returns the store's stock or limit message with its status", async () => {
    const store = fakeStore({
      createHold: new ShopHoldError(409, "Not enough Hoodie left in this drop."),
    });
    const { api } = await setup({ store });
    try {
      const response = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: shopCatalog.catalogVersion,
        items: CART,
      });
      assert.equal(response.status, 409);
      assert.equal(response.body.message, "Not enough Hoodie left in this drop.");
    } finally {
      await api.close();
    }
  });

  it("returns a generic 500 and logs the cause for an unexpected store failure", async () => {
    const logged = mock.method(console, "error", () => {});
    const store = fakeStore({ createHold: new Error("connection reset") });
    const { api } = await setup({ store });
    try {
      const response = await api.request("POST", "/api/v1/shop/holds", {
        catalogVersion: shopCatalog.catalogVersion,
        items: CART,
      });
      assert.equal(response.status, 500);
      assert.equal(response.body.message, "Unable to update your hold right now. Please try again.");
      assert.equal(logged.mock.callCount(), 1);
    } finally {
      await api.close();
    }
  });
});

describe("GET /api/v1/shop/holds/:holdId", () => {
  it("returns the student's hold", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("GET", `/api/v1/shop/holds/${HOLD_ID}`);
      assert.equal(response.status, 200);
      assert.equal(response.body.hold.id, HOLD_ID);
      assert.equal(response.body.savedVenmoUsername, null);
      assert.equal(store.calls[0].args.userId, USER_ID);
      assert.equal(store.calls[0].args.holdId, HOLD_ID);
    } finally {
      await api.close();
    }
  });

  it("returns the Venmo username saved by the student's earlier purchase", async () => {
    const { api } = await setup({ store: fakeStore({ findSavedVenmoUsername: "jane.doe" }) });
    try {
      const response = await api.request("GET", `/api/v1/shop/holds/${HOLD_ID}`);
      assert.equal(response.status, 200);
      assert.equal(response.body.savedVenmoUsername, "jane.doe");
    } finally {
      await api.close();
    }
  });

  it("returns 404 for a malformed id without calling the store", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("GET", "/api/v1/shop/holds/not-an-id");
      assert.equal(response.status, 404);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("returns 404 when the store does not find a hold for this student", async () => {
    const store = fakeStore({ getHold: new ShopHoldError(404, "Hold not found.") });
    const { api } = await setup({ store });
    try {
      const response = await api.request("GET", `/api/v1/shop/holds/${HOLD_ID}`);
      assert.equal(response.status, 404);
      assert.equal(response.body.message, "Hold not found.");
    } finally {
      await api.close();
    }
  });

  it("reports an expired hold with status expired", async () => {
    const store = fakeStore({ getHold: storedHold({ status: "expired" }) });
    const { api } = await setup({ store });
    try {
      const response = await api.request("GET", `/api/v1/shop/holds/${HOLD_ID}`);
      assert.equal(response.status, 200);
      assert.equal(response.body.hold.status, "expired");
    } finally {
      await api.close();
    }
  });
});

describe("DELETE /api/v1/shop/holds/:holdId", () => {
  it("cancels the hold and returns it as cancelled", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("DELETE", `/api/v1/shop/holds/${HOLD_ID}`);
      assert.equal(response.status, 200);
      assert.equal(response.body.hold.status, "cancelled");
      assert.equal(store.calls[0].name, "cancelHold");
    } finally {
      await api.close();
    }
  });

  it("returns 409 when the hold has already expired", async () => {
    const store = fakeStore({
      cancelHold: new ShopHoldError(409, "This hold has expired. Its items have been released."),
    });
    const { api } = await setup({ store });
    try {
      const response = await api.request("DELETE", `/api/v1/shop/holds/${HOLD_ID}`);
      assert.equal(response.status, 409);
    } finally {
      await api.close();
    }
  });
});

describe("PATCH /api/v1/shop/holds/:holdId/lines", () => {
  it("removes the named line and returns the hold with its deadline unchanged", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("PATCH", `/api/v1/shop/holds/${HOLD_ID}/lines`, {
        sku: "info-hoodie",
        size: "M",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.hold.expiresAt, new Date(DEADLINE_MS).toISOString());
      assert.deepEqual(store.calls[0].args, {
        holdId: HOLD_ID,
        userId: USER_ID,
        sku: "info-hoodie",
        size: "M",
        nowMs: OPEN_MS,
      });
    } finally {
      await api.close();
    }
  });

  it("rejects a missing sku or size without calling the store", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("PATCH", `/api/v1/shop/holds/${HOLD_ID}/lines`, { sku: "info-hoodie" });
      assert.equal(response.status, 400);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("returns 404 when the line is not in the hold", async () => {
    const store = fakeStore({ removeLineFromHold: new ShopHoldError(404, "That line is not in this hold.") });
    const { api } = await setup({ store });
    try {
      const response = await api.request("PATCH", `/api/v1/shop/holds/${HOLD_ID}/lines`, {
        sku: "info-hoodie",
        size: "XL",
      });
      assert.equal(response.status, 404);
    } finally {
      await api.close();
    }
  });
});

describe("POST /api/v1/shop/holds/:holdId/confirm", () => {
  it("creates a pending purchase with the normalized Venmo username", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("POST", `/api/v1/shop/holds/${HOLD_ID}/confirm`, {
        venmoUsername: "  @Jane.Doe ",
        phoneNumber: "(206) 555-0123",
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.purchase, {
        id: PURCHASE_ID,
        status: "pending",
        venmoUsername: "jane.doe",
        totalCents: 6400,
        confirmedAt: new Date(OPEN_MS).toISOString(),
      });
      assert.equal(store.calls[0].args.venmoUsername, "jane.doe");
      assert.equal(store.calls[0].args.phoneNumber, "2065550123");
      assert.equal(store.calls[0].args.userId, USER_ID);
      assert.equal(store.calls[0].args.nowMs, OPEN_MS);
    } finally {
      await api.close();
    }
  });

  it("rejects an invalid Venmo username without calling the store", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("POST", `/api/v1/shop/holds/${HOLD_ID}/confirm`, {
        venmoUsername: "jane doe",
      });
      assert.equal(response.status, 400);
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("rejects an invalid phone number without calling the store", async () => {
    const { api, store } = await setup();
    try {
      const response = await api.request("POST", `/api/v1/shop/holds/${HOLD_ID}/confirm`, {
        venmoUsername: "jane.doe",
        phoneNumber: "555-01",
      });
      assert.equal(response.status, 400);
      assert.equal(
        response.body.message,
        "Enter a valid phone number: 7 to 15 digits, with a country code if it is not a US number."
      );
      assert.equal(store.calls.length, 0);
    } finally {
      await api.close();
    }
  });

  it("rejects a confirmation after the deadline with 409", async () => {
    const store = fakeStore({
      confirmHold: new ShopHoldError(409, "This hold has expired. Its items have been released."),
    });
    const { api } = await setup({ store });
    try {
      const response = await api.request("POST", `/api/v1/shop/holds/${HOLD_ID}/confirm`, {
        venmoUsername: "jane.doe",
        phoneNumber: "2065550123",
      });
      assert.equal(response.status, 409);
      assert.equal(response.body.message, "This hold has expired. Its items have been released.");
    } finally {
      await api.close();
    }
  });
});
