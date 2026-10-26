import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createShopRouter } from "../routes/api/v1/controllers/shop.js";
import { shopCatalog } from "../routes/api/v1/utils/shopCatalog.js";
import { ShopReviewError } from "../routes/api/v1/utils/shopPurchaseReview.js";
import { makeTestApi, roleAssignmentsGranting } from "./testApi.js";

const OFFICER_ID = "64b0000000000000000000aa";
const PURCHASE_ID = "64b0000000000000000000ff";
const NOW_MS = Date.parse("2030-03-01T18:00:00Z");
const PICKED_UP_MESSAGE = "This order was picked up, so the change needs a reason. Nothing changed.";

const officer = { isAuthenticated: true, userId: OFFICER_ID };
const adminAccount = { ...officer, isAdmin: true, memberType: "Admin" };

function reviewRecord(overrides = {}) {
  return {
    _id: PURCHASE_ID,
    userId: "64b0000000000000000000bb",
    catalogId: "drop-1",
    venmoUsername: "example-student",
    lines: [
      { sku: "info-hoodie", name: "Hoodie", size: "M", quantity: 1, unitPriceCents: 3200 },
      { sku: "info-tote-bag", name: "Tote Bag", size: "One Size", quantity: 2, unitPriceCents: 2000 },
    ],
    totalCents: 7200,
    status: "pending",
    confirmedAt: new Date("2030-02-27T17:30:00Z"),
    reviewRevision: 3,
    awaitingStudentReply: true,
    followUpStatus: "will_pay",
    followUpUpdatedBy: OFFICER_ID,
    followUpUpdatedAt: new Date("2030-02-28T09:00:00Z"),
    followUpUpdatedByName: "Olive Officer",
    buyer: { id: "64b0000000000000000000bb", name: "Example Student", email: "example@uw.edu" },
    recentHistory: [
      { changedBy: OFFICER_ID, actorName: "Olive Officer", at: new Date("2030-02-28T09:00:00Z"), kind: "follow_up", from: "none", to: "will_pay", note: "Paying Friday." },
    ],
    ...overrides,
  };
}

// Records every review store call; a method returns its entry in `results`, or throws it when it is an Error.
function fakeReviewStore(results = {}) {
  const calls = [];
  const merged = {
    listPurchases: { purchases: [reviewRecord()], nextCursor: "next-page" },
    getPurchase: reviewRecord(),
    countPurchases: {
      counts: { pending: 7, paid: 1, ready: 1, picked_up: 0, not_paid: 2, refunded: 1, all: 11, short: 1, awaiting: 2, says_paid: 1 },
      totals: { expectedCents: 31200, receivedCents: 11200, owedCents: 20000, pendingOrders: 7, receivedOrders: 3, confirmedCents: 6400 },
    },
    setPaymentStatus: reviewRecord({ status: "paid", reviewRevision: 4 }),
    setFollowUp: reviewRecord({ awaitingStudentReply: false, followUpStatus: null, reviewRevision: 4 }),
    setAmountReceived: reviewRecord({ amountReceivedCents: 5000, reviewRevision: 4 }),
    addNote: reviewRecord({ reviewRevision: 4 }),
    setPickup: reviewRecord({ pickedUpAt: new Date("2030-03-01T18:00:00Z"), pickedUpBy: OFFICER_ID, pickedUpByName: "Olive Officer", reviewRevision: 4 }),
    listReadyForPickup: {
      orders: [reviewRecord({
        status: "paid",
        pickedUpAt: null,
        pickedUpBy: null,
        buyer: { id: "64b0000000000000000000bb", name: "Example Student", email: "example@uw.edu", firstName: "Example", lastName: "Student", preferredName: null },
      })],
      truncated: false,
      counts: { ready: 18, pickedUp: 22 },
    },
    ...results,
  };
  const method = (name) => async (_models, args) => {
    calls.push({ name, args });
    if (merged[name] instanceof Error) throw merged[name];
    return merged[name];
  };
  return {
    calls,
    listPurchases: method("listPurchases"),
    getPurchase: method("getPurchase"),
    countPurchases: method("countPurchases"),
    setPaymentStatus: method("setPaymentStatus"),
    setFollowUp: method("setFollowUp"),
    setAmountReceived: method("setAmountReceived"),
    addNote: method("addNote"),
    setPickup: method("setPickup"),
    listReadyForPickup: method("listReadyForPickup"),
  };
}

const reviewer = { RoleAssignments: roleAssignmentsGranting(["shop.purchases.review"]) };
const otherOfficer = { RoleAssignments: roleAssignmentsGranting(["events.finance.manage"]) };
const noRoles = { RoleAssignments: roleAssignmentsGranting([]) };

describe("shop purchase review routes", () => {
  let api;
  let store;

  before(async () => {
    store = fakeReviewStore();
    api = await makeTestApi({
      router: createShopRouter({ catalog: shopCatalog, now: () => NOW_MS, reviewStore: store }),
      mountPath: "/api/v1/shop",
      models: reviewer,
      session: officer,
    });
  });

  after(async () => {
    await api.close();
  });

  function lastCall(name) {
    return store.calls.filter((call) => call.name === name).at(-1);
  }

  describe("access", () => {
    it("refuses every purchase read and write without the permission", async () => {
      const before = store.calls.length;
      const anonymous = { session: { isAuthenticated: false } };
      const requests = [
        ["GET", "/api/v1/shop/purchases"],
        ["GET", "/api/v1/shop/purchases/counts"],
        ["GET", "/api/v1/shop/purchases/pickup"],
        ["GET", `/api/v1/shop/purchases/${PURCHASE_ID}`],
        ["PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, { status: "paid", expectedRevision: 0 }],
        ["PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/follow-up`, { followUpStatus: "contacted", expectedRevision: 0 }],
        ["PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/amount-received`, { amountReceivedCents: 5000, expectedRevision: 0 }],
        ["POST", `/api/v1/shop/purchases/${PURCHASE_ID}/notes`, { title: "Venmo name changed", expectedRevision: 0 }],
        ["PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/pickup`, { pickedUp: true, expectedRevision: 0 }],
      ];
      for (const [method, path, body] of requests) {
        assert.equal((await api.request(method, path, body, anonymous)).status, 401, `${method} ${path} anonymous`);
        assert.equal((await api.request(method, path, body, { session: adminAccount, models: noRoles })).status, 403, `${method} ${path} Admin account`);
        assert.equal((await api.request(method, path, body, { models: otherOfficer })).status, 403, `${method} ${path} officer`);
      }
      assert.equal(store.calls.length, before, "no store call without permission");
    });
  });

  describe("listing", () => {
    it("defaults to pending orders, 25 per page, and returns allowed fields only", async () => {
      const result = await api.request("GET", "/api/v1/shop/purchases");

      assert.equal(result.status, 200);
      assert.deepEqual(lastCall("listPurchases").args, { status: "pending", balance: "all", followUp: "all", pickup: "all", q: "", limit: 25, cursor: undefined });
      assert.equal(result.body.nextCursor, "next-page");
      assert.deepEqual(result.body.purchases[0], {
        id: PURCHASE_ID,
        buyer: { id: "64b0000000000000000000bb", name: "Example Student", email: "example@uw.edu" },
        venmoUsername: "example-student",
        lines: [
          { sku: "info-hoodie", name: "Hoodie", size: "M", quantity: 1, unitPriceCents: 3200, lineTotalCents: 3200 },
          { sku: "info-tote-bag", name: "Tote Bag", size: "One Size", quantity: 2, unitPriceCents: 2000, lineTotalCents: 4000 },
        ],
        totalCents: 7200,
        amountReceivedCents: null,
        confirmedAt: "2030-02-27T17:30:00.000Z",
        status: "pending",
        revision: 3,
        followUp: { status: "will_pay", updatedBy: "Olive Officer", updatedAt: "2030-02-28T09:00:00.000Z" },
        pickup: { pickedUpAt: null, pickedUpBy: null },
        history: [{ actor: "Olive Officer", at: "2030-02-28T09:00:00.000Z", kind: "follow_up", from: "none", to: "will_pay", note: "Paying Friday." }],
      });
    });

    it("shows who picked an order up and when, from the store's record", async () => {
      const pickedUpAt = new Date("2030-03-01T18:05:00Z");
      await withRoutes(fakeReviewStore({
        listPurchases: { purchases: [reviewRecord({ status: "paid", pickedUpAt, pickedUpBy: OFFICER_ID, pickedUpByName: "Jordan Lee" })], nextCursor: null },
      }), async (local) => {
        const result = await local.request("GET", "/api/v1/shop/purchases?status=all");
        assert.deepEqual(result.body.purchases[0].pickup, { pickedUpAt: "2030-03-01T18:05:00.000Z", pickedUpBy: "Jordan Lee" });
      });
    });

    it("sends the amount Mark unpaid restores on Paid orders only, and null when nothing was recorded", async () => {
      const store = fakeReviewStore({
        listPurchases: {
          purchases: [
            reviewRecord({ status: "paid", amountBeforePaidCents: 4000 }),
            reviewRecord({ status: "paid", amountBeforePaidCents: null }),
            reviewRecord({ status: "pending" }),
          ],
          nextCursor: null,
        },
      });
      await withRoutes(store, async (local) => {
        const result = await local.request("GET", "/api/v1/shop/purchases");
        const [withAmount, withoutAmount, unpaid] = result.body.purchases;

        assert.equal(withAmount.amountBeforePaidCents, 4000);
        assert.equal(withoutAmount.amountBeforePaidCents, null);
        assert.equal("amountBeforePaidCents" in unpaid, false, "pending orders carry no figure");
      });
    });

    it("keeps purchase data out of shared caches", async () => {
      const { headers } = await api.request("GET", "/api/v1/shop/purchases");
      assert.match(headers["cache-control"], /no-store/);
      assert.match(headers["cache-control"], /private/);
    });

    it("passes filters, trimmed search, page size, and cursor to the store", async () => {
      await api.request("GET", "/api/v1/shop/purchases?status=all&balance=short&followUp=awaiting&pickup=picked_up&q=%20Quinn%20&limit=50&cursor=abc");
      assert.deepEqual(lastCall("listPurchases").args, {
        status: "all",
        balance: "short",
        followUp: "awaiting",
        pickup: "picked_up",
        q: "Quinn",
        limit: 50,
        cursor: "abc",
      });
    });

    it("rejects malformed filters, page sizes, and over-long search", async () => {
      const bad = [
        "status=shipped",
        "followUp=maybe",
        "balance=over",
        "balance=short&balance=all",
        "pickup=done",
        "pickup=ready&pickup=all",
        "limit=0",
        "limit=51",
        "limit=2.5",
        "status=paid&status=pending",
        `q=${"a".repeat(121)}`,
      ];
      for (const query of bad) {
        const result = await api.request("GET", `/api/v1/shop/purchases?${query}`);
        assert.equal(result.status, 400, query);
      }
    });

    it("reports a stale cursor from the store as a bad request", async () => {
      await withRoutes(fakeReviewStore({ listPurchases: new ShopReviewError(400, "This page of results is out of date. Search again.") }), async (local) => {
        const result = await local.request("GET", "/api/v1/shop/purchases?cursor=old");
        assert.equal(result.status, 400);
        assert.match(result.body.message, /out of date/);
      });
    });
  });

  describe("pickup board", () => {
    it("lists every ready order with what the page needs, the progress counts, and no money or contact details", async () => {
      const result = await api.request("GET", "/api/v1/shop/purchases/pickup");

      assert.equal(result.status, 200);
      assert.deepEqual(lastCall("listReadyForPickup").args, { limit: 1000 });
      assert.equal(result.body.truncated, false);
      assert.equal(result.body.limit, 1000);
      assert.deepEqual(result.body.counts, { ready: 18, pickedUp: 22 });
      assert.deepEqual(result.body.orders[0], {
        id: PURCHASE_ID,
        revision: 3,
        venmoUsername: "example-student",
        buyer: { id: "64b0000000000000000000bb", name: "Example Student", email: "example@uw.edu", firstName: "Example", lastName: "Student", preferredName: null },
        status: "paid",
        lines: [
          { sku: "info-hoodie", name: "Hoodie", size: "M", quantity: 1 },
          { sku: "info-tote-bag", name: "Tote Bag", size: "One Size", quantity: 2 },
        ],
      });
      assert.equal("totalCents" in result.body.orders[0], false);
      assert.equal("history" in result.body.orders[0], false);
    });

    it("tells the page the board was cut short when the store reports more ready orders than the cap", async () => {
      await withRoutes(fakeReviewStore({
        listReadyForPickup: { orders: [reviewRecord({ status: "paid" })], truncated: true, counts: { ready: 1200, pickedUp: 0 } },
      }), async (local) => {
        const result = await local.request("GET", "/api/v1/shop/purchases/pickup");
        assert.equal(result.status, 200);
        assert.equal(result.body.truncated, true);
        assert.deepEqual(result.body.counts, { ready: 1200, pickedUp: 0 });
      });
    });

    it("keeps the board out of shared caches", async () => {
      const { headers } = await api.request("GET", "/api/v1/shop/purchases/pickup");
      assert.match(headers["cache-control"], /no-store/);
      assert.match(headers["cache-control"], /private/);
    });

    it("hides an unexpected failure behind a generic message", async () => {
      await withRoutes(fakeReviewStore({ listReadyForPickup: new Error("connection reset") }), async (local) => {
        const result = await local.request("GET", "/api/v1/shop/purchases/pickup");
        assert.equal(result.status, 500);
        assert.equal(result.body.message, "Unable to update orders right now. Please try again.");
      });
    });
  });

  describe("status counts", () => {
    it("returns order counts and the pending money totals, privately", async () => {
      const result = await api.request("GET", "/api/v1/shop/purchases/counts");
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.counts, {
        pending: 7, paid: 1, ready: 1, picked_up: 0, not_paid: 2, refunded: 1, all: 11, short: 1, awaiting: 2, says_paid: 1,
      });
      assert.deepEqual(result.body.totals, {
        expectedCents: 31200,
        receivedCents: 11200,
        owedCents: 20000,
        pendingOrders: 7,
        receivedOrders: 3,
        confirmedCents: 6400,
      });
      assert.match(result.headers["cache-control"], /no-store/);
    });
  });

  describe("one order", () => {
    it("reads one order for a fresh review", async () => {
      const result = await api.request("GET", `/api/v1/shop/purchases/${PURCHASE_ID}`);
      assert.equal(result.status, 200);
      assert.equal(result.body.purchase.id, PURCHASE_ID);
    });

    it("reports a malformed id as not found without reading", async () => {
      const before = store.calls.length;
      const result = await api.request("GET", "/api/v1/shop/purchases/not-an-id");
      assert.equal(result.status, 404);
      assert.equal(store.calls.length, before);
    });
  });

  describe("decisions", () => {
    it("records a payment decision with the session officer and server time, never the body's", async () => {
      const result = await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, {
        status: "paid",
        expectedRevision: 3,
        changedBy: "64b0000000000000000000cc",
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.purchase.status, "paid");
      assert.deepEqual(lastCall("setPaymentStatus").args, {
        purchaseId: PURCHASE_ID,
        status: "paid",
        note: undefined,
        expectedRevision: 3,
        changedBy: OFFICER_ID,
        nowMs: NOW_MS,
      });
    });

    it("records a reason with a payment change, trimmed, and none when it is blank", async () => {
      await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, {
        status: "pending",
        note: "  Marked paid by mistake  ",
        expectedRevision: 3,
      });
      assert.equal(lastCall("setPaymentStatus").args.note, "Marked paid by mistake");

      await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, { status: "pending", note: " ", expectedRevision: 3 });
      assert.equal(lastCall("setPaymentStatus").args.note, undefined);
    });

    it("rejects a payment reason that is not text or is over 500 characters, without writing", async () => {
      const before = store.calls.length;
      const bad = [
        { status: "pending", note: 5, expectedRevision: 0 },
        { status: "pending", note: "a".repeat(501), expectedRevision: 0 },
      ];
      for (const body of bad) {
        const result = await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, body);
        assert.equal(result.status, 400, JSON.stringify(body).slice(0, 80));
      }
      assert.equal(store.calls.length, before);
    });

    it("answers a refused change after pickup with a conflict and its reason, without saving a note it was not given", async () => {
      const refusing = fakeReviewStore({ setPaymentStatus: new ShopReviewError(409, PICKED_UP_MESSAGE) });
      const refusingApi = await makeTestApi({
        router: createShopRouter({ catalog: shopCatalog, now: () => NOW_MS, reviewStore: refusing }),
        mountPath: "/api/v1/shop",
        models: reviewer,
        session: officer,
      });
      try {
        const result = await refusingApi.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, {
          status: "refunded",
          note: "   ",
          expectedRevision: 3,
        });

        assert.equal(result.status, 409);
        assert.equal(result.body.message, PICKED_UP_MESSAGE);
        assert.equal(refusing.calls.length, 1);
        assert.equal(refusing.calls[0].args.note, undefined);
      } finally {
        await refusingApi.close();
      }
    });

    it("saves a reason for a change after pickup and returns the pickup mark and the flagged activity entry", async () => {
      const flagged = reviewRecord({
        status: "refunded",
        reviewRevision: 4,
        pickedUpAt: new Date("2030-03-01T18:05:00Z"),
        pickedUpBy: OFFICER_ID,
        pickedUpByName: "Olive Officer",
        recentHistory: [{
          changedBy: OFFICER_ID,
          actorName: "Olive Officer",
          at: new Date("2030-03-01T18:10:00Z"),
          kind: "payment",
          from: "paid",
          to: "refunded",
          note: "Returned the hoodie",
          afterPickup: true,
        }],
      });
      const flaggedStore = fakeReviewStore({ setPaymentStatus: flagged });
      const flaggedApi = await makeTestApi({
        router: createShopRouter({ catalog: shopCatalog, now: () => NOW_MS, reviewStore: flaggedStore }),
        mountPath: "/api/v1/shop",
        models: reviewer,
        session: officer,
      });
      try {
        const result = await flaggedApi.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, {
          status: "refunded",
          note: "  Returned the hoodie  ",
          expectedRevision: 3,
        });

        assert.equal(result.status, 200);
        assert.equal(flaggedStore.calls[0].args.note, "Returned the hoodie");
        assert.equal(result.body.purchase.status, "refunded");
        assert.deepEqual(result.body.purchase.pickup, {
          pickedUpAt: "2030-03-01T18:05:00.000Z",
          pickedUpBy: "Olive Officer",
        });
        assert.equal(result.body.purchase.history[0].afterPickup, true);
        assert.equal(result.body.purchase.history[0].note, "Returned the hoodie");
      } finally {
        await flaggedApi.close();
      }
    });

    it("logs a follow-up with a trimmed note, or clears it", async () => {
      const result = await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/follow-up`, {
        followUpStatus: "will_pay",
        note: "  Paying Friday.  ",
        expectedRevision: 3,
      });

      assert.equal(result.status, 200);
      assert.deepEqual(lastCall("setFollowUp").args, {
        purchaseId: PURCHASE_ID,
        followUpStatus: "will_pay",
        note: "Paying Friday.",
        expectedRevision: 3,
        changedBy: OFFICER_ID,
        nowMs: NOW_MS,
      });

      const cleared = await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/follow-up`, { followUpStatus: "none", note: " ", expectedRevision: 3 });
      assert.equal(cleared.body.purchase.followUp.status, null);
      assert.equal(lastCall("setFollowUp").args.note, undefined);
    });

    it("adds a note with a trimmed topic and description, from the session officer at server time", async () => {
      const result = await api.request("POST", `/api/v1/shop/purchases/${PURCHASE_ID}/notes`, {
        title: "  Venmo name changed  ",
        note: "  Now pays from @priya-r.  ",
        expectedRevision: 3,
      });

      assert.equal(result.status, 200);
      assert.deepEqual(lastCall("addNote").args, {
        purchaseId: PURCHASE_ID,
        title: "Venmo name changed",
        note: "Now pays from @priya-r.",
        expectedRevision: 3,
        changedBy: OFFICER_ID,
        nowMs: NOW_MS,
      });

      await api.request("POST", `/api/v1/shop/purchases/${PURCHASE_ID}/notes`, { title: "Called", note: " ", expectedRevision: 3 });
      assert.equal(lastCall("addNote").args.note, undefined);
    });

    it("rejects a note without a topic, or with one or a description that is too long, without writing", async () => {
      const before = store.calls.length;
      const bad = [
        { expectedRevision: 0 },
        { title: "   ", expectedRevision: 0 },
        { title: 5, expectedRevision: 0 },
        { title: "a".repeat(81), expectedRevision: 0 },
        { title: "Called", note: "a".repeat(501), expectedRevision: 0 },
        { title: "Called" },
      ];
      for (const body of bad) {
        const result = await api.request("POST", `/api/v1/shop/purchases/${PURCHASE_ID}/notes`, body);
        assert.equal(result.status, 400, JSON.stringify(body).slice(0, 80));
      }
      assert.equal(store.calls.length, before);
    });

    it("records the amount received with the session officer and server time", async () => {
      const result = await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/amount-received`, {
        amountReceivedCents: 5000,
        expectedRevision: 3,
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.purchase.amountReceivedCents, 5000);
      assert.deepEqual(lastCall("setAmountReceived").args, {
        purchaseId: PURCHASE_ID,
        amountReceivedCents: 5000,
        expectedRevision: 3,
        changedBy: OFFICER_ID,
        nowMs: NOW_MS,
      });
    });

    it("records a pickup with the session officer and server time, never the body's", async () => {
      const result = await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/pickup`, {
        pickedUp: true,
        expectedRevision: 3,
        pickedUpBy: "64b0000000000000000000cc",
      });

      assert.equal(result.status, 200);
      assert.deepEqual(lastCall("setPickup").args, {
        purchaseId: PURCHASE_ID,
        pickedUp: true,
        expectedRevision: 3,
        changedBy: OFFICER_ID,
        nowMs: NOW_MS,
      });
      assert.equal(result.body.purchase.pickup.pickedUpBy, "Olive Officer");
    });

    it("clears a pickup when told the order is not picked up", async () => {
      const result = await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/pickup`, { pickedUp: false, expectedRevision: 4 });

      assert.equal(result.status, 200);
      assert.equal(lastCall("setPickup").args.pickedUp, false);
      assert.equal(lastCall("setPickup").args.expectedRevision, 4);
    });

    it("rejects a pickup without a true or false flag or a revision, without writing", async () => {
      const before = store.calls.length;
      const bad = [
        {},
        { expectedRevision: 3 },
        { pickedUp: "true", expectedRevision: 3 },
        { pickedUp: 1, expectedRevision: 3 },
        { pickedUp: true },
        { pickedUp: true, expectedRevision: -1 },
        { pickedUp: true, expectedRevision: "3" },
      ];
      for (const body of bad) {
        const result = await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/pickup`, body);
        assert.equal(result.status, 400, JSON.stringify(body));
      }
      assert.equal(store.calls.length, before);
    });

    it("reports a malformed order id as not found without writing", async () => {
      const before = store.calls.length;
      const result = await api.request("PATCH", "/api/v1/shop/purchases/not-an-id/pickup", { pickedUp: true, expectedRevision: 0 });
      assert.equal(result.status, 404);
      assert.equal(store.calls.length, before);
    });

    it("passes the store's conflict and not-paid errors through with their messages", async () => {
      await withRoutes(fakeReviewStore({
        setPickup: new ShopReviewError(409, "Only paid orders can be picked up."),
      }), async (local) => {
        const result = await local.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/pickup`, { pickedUp: true, expectedRevision: 0 });
        assert.equal(result.status, 409);
        assert.equal(result.body.message, "Only paid orders can be picked up.");
      });
    });

    it("rejects malformed decisions without writing", async () => {
      const before = store.calls.length;
      const bad = [
        ["payment", { status: "shipped", expectedRevision: 0 }],
        ["payment", { status: "paid" }],
        ["payment", { status: "paid", expectedRevision: -1 }],
        ["payment", { status: "paid", expectedRevision: "3" }],
        ["follow-up", { followUpStatus: "replied", expectedRevision: 0 }],
        ["follow-up", { awaitingStudentReply: true, expectedRevision: 0 }],
        ["follow-up", { followUpStatus: "contacted", expectedRevision: 1.5 }],
        ["follow-up", { followUpStatus: "contacted", note: 5, expectedRevision: 0 }],
        ["follow-up", { followUpStatus: "contacted", note: "a".repeat(501), expectedRevision: 0 }],
        ["amount-received", { amountReceivedCents: 50.5, expectedRevision: 0 }],
        ["amount-received", { amountReceivedCents: -1, expectedRevision: 0 }],
        ["amount-received", { amountReceivedCents: "5000", expectedRevision: 0 }],
        ["amount-received", { amountReceivedCents: 5000 }],
      ];
      for (const [kind, body] of bad) {
        const result = await api.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/${kind}`, body);
        assert.equal(result.status, 400, JSON.stringify(body));
      }
      assert.equal(store.calls.length, before);
    });

    it("passes the store's conflict and consistency errors through with their messages", async () => {
      const conflict = fakeReviewStore({
        setPaymentStatus: new ShopReviewError(409, "Another officer updated this order. Review the latest details before choosing an action."),
      });
      await withRoutes(conflict, async (local) => {
        const result = await local.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, { status: "not_paid", expectedRevision: 0 });
        assert.equal(result.status, 409);
        assert.match(result.body.message, /Another officer updated this order/);
      });
    });

    it("logs a stock counter failure once with the counter facts, and keeps buyer details out of the log", async () => {
      const details = { purchaseId: PURCHASE_ID, counter: "drop stock", reason: "too low", catalogId: "drop-1", sku: "info-hoodie", quantity: 2, current: 1 };
      const logged = [];
      const originalError = console.error;
      console.error = (...args) => logged.push(args.join(" "));
      try {
        const store = fakeReviewStore({
          setPaymentStatus: new ShopReviewError(500, "Stock counts for this order are missing or inconsistent. Nothing changed; ask a maintainer to check the shop counters.", details),
        });
        await withRoutes(store, async (local) => {
          const result = await local.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, { status: "not_paid", expectedRevision: 0 });
          assert.equal(result.status, 500);
          assert.equal(result.body.message, "Stock counts for this order are missing or inconsistent. Nothing changed; ask a maintainer to check the shop counters.");
          assert.doesNotMatch(JSON.stringify(result.body), /info-hoodie|drop-1|too low/);
        });
      } finally {
        console.error = originalError;
      }
      assert.equal(logged.length, 1);
      assert.match(logged[0], new RegExp(PURCHASE_ID));
      assert.match(logged[0], /drop stock/);
      assert.match(logged[0], /too low/);
      assert.match(logged[0], /info-hoodie/);
      assert.doesNotMatch(logged[0], /example-student|example@uw\.edu|Example Student|64b0000000000000000000bb/);
    });

    it("does not log an ordinary conflict, since it is a normal outcome", async () => {
      const logged = [];
      const originalError = console.error;
      console.error = (...args) => logged.push(args.join(" "));
      try {
        const store = fakeReviewStore({
          setPaymentStatus: new ShopReviewError(409, "Another officer updated this order. Review the latest details before choosing an action."),
        });
        await withRoutes(store, async (local) => {
          const result = await local.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/payment`, { status: "not_paid", expectedRevision: 0 });
          assert.equal(result.status, 409);
        });
      } finally {
        console.error = originalError;
      }
      assert.deepEqual(logged, []);
    });

    it("hides unexpected failures behind a generic message", async () => {
      const originalError = console.error;
      console.error = () => {};
      try {
        await withRoutes(fakeReviewStore({ setFollowUp: new Error("connection reset by example-host") }), async (local) => {
          const result = await local.request("PATCH", `/api/v1/shop/purchases/${PURCHASE_ID}/follow-up`, { followUpStatus: "contacted", expectedRevision: 0 });
          assert.equal(result.status, 500);
          assert.doesNotMatch(result.body.message, /example-host/);
        });
      } finally {
        console.error = originalError;
      }
    });
  });

  it("keeps order review available while manual checkout is not exposed", async () => {
    const result = await api.request("GET", "/api/v1/shop/purchases");
    assert.equal(result.status, 200);
  });
});

// Runs `use` against a separate API backed by `store`, closing it even when an assertion fails.
async function withRoutes(store, use) {
  const api = await makeTestApi({
    router: createShopRouter({ catalog: shopCatalog, now: () => NOW_MS, reviewStore: store }),
    mountPath: "/api/v1/shop",
    models: reviewer,
    session: officer,
  });
  try {
    await use(api);
  } finally {
    await api.close();
  }
}
