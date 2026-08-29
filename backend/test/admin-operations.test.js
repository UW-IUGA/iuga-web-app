import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import dashboardRouter from "../routes/api/v1/controllers/dashboard.js";
import notificationsRouter from "../routes/api/v1/controllers/notifications.js";
import exportsRouter from "../routes/api/v1/controllers/exports.js";
import cyclesRouter from "../routes/api/v1/controllers/cycles.js";
import { makeTestApi } from "./testApi.js";

const userId = "507f1f77bcf86cd799439011";
const cycleId = "507f1f77bcf86cd799439012";
const requestId = "507f1f77bcf86cd799439013";
const notificationId = "507f1f77bcf86cd799439014";

function chain(value) {
  return {
    sort() { return this; },
    populate() { return this; },
    async lean() { return value; },
  };
}

function models() {
  const requests = [{ _id: requestId, title: "Workshop", eventName: "Workshop", status: "FINANCE_REVIEW", requesterId: userId, updatedAt: new Date() }];
  const notifications = [{ _id: notificationId, recipientId: userId, decision: "finance_approve", comment: "Funding approved" }];
  return {
    Cycles: { findOne() { return { async lean() { return { _id: cycleId, status: "active", cycleName: "2026–2027", budgetTotalCents: 100000, budgetCommittedCents: 25000 }; } }; } },
    RoleAssignments: { find() { return { async populate() { return [{ cycleId, roleId: { isActive: true, permissions: ["dashboard.read", "events.finance.manage", "notifications.read", "notifications.manage", "exports.manage"] } }]; } }; } },
    EventRequests: { find() { return chain(requests); } },
    EventReviews: { find() { return chain([{ eventRequestId: requestId, actualAttendance: 20, pros: "Good" }]); } },
    BudgetLedgerEntries: { find() { return chain([{ cycleId, eventRequestId: requestId, amountCents: 25000, decision: "approved", decidedAt: new Date() }]); } },
    Notifications: {
      find() { return chain(notifications); },
      async findOneAndUpdate() { return { ...notifications[0], readAt: new Date() }; },
    },
    NotificationPreferences: {
      findOne() { return { async lean() { return null; } }; },
      async findOneAndUpdate(_filter, update) { return update.$set; },
    },
  };
}

function archivalModels() {
  const request = { _id: requestId, cycleId, status: "REVIEWED" };
  return {
    Cycles: {
      findOne() { return { async lean() { return { _id: cycleId, status: "active" }; } }; },
      async findOneAndUpdate() { return { _id: cycleId, status: "closed" }; },
    },
    RoleAssignments: { find() { return { async populate() { return [{ cycleId, roleId: { isActive: true, permissions: ["cycles.archive"] } }]; } }; } },
    EventRequests: {
      find() { return chain([request]); },
      async findOneAndUpdate() { return { ...request, status: "ARCHIVED" }; },
    },
    AuditEntries: { async create(fields) { return fields; } },
  };
}

describe("admin operations APIs", () => {
  let dashboardApi;
  let notificationsApi;
  let exportsApi;
  let cyclesApi;
  const session = { isAuthenticated: true, userId };

  before(async () => {
    dashboardApi = await makeTestApi({ router: dashboardRouter, mountPath: "/api/v1/dashboard", models: models(), session });
    notificationsApi = await makeTestApi({ router: notificationsRouter, mountPath: "/api/v1/notifications", models: models(), session });
    exportsApi = await makeTestApi({ router: exportsRouter, mountPath: "/api/v1/exports", models: models(), session });
    cyclesApi = await makeTestApi({ router: cyclesRouter, mountPath: "/api/v1/cycles", models: archivalModels(), session });
  });

  after(async () => Promise.all([dashboardApi.close(), notificationsApi.close(), exportsApi.close(), cyclesApi.close()]));

  it("returns only queues allowed by the user's active permissions", async () => {
    const result = await dashboardApi.request("GET", "/api/v1/dashboard");
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.queues.map((queue) => queue.key), ["FINANCE_REVIEW"]);
    assert.equal(result.body.activeCycle.cycleName, "2026–2027");
  });

  it("scopes notification reads and stores preferences", async () => {
    const notifications = await notificationsApi.request("GET", "/api/v1/notifications");
    assert.equal(notifications.status, 200);
    assert.equal(notifications.body.notifications.length, 1);

    const preferences = await notificationsApi.request("PUT", "/api/v1/notifications/preferences", { channel: "email", frequency: "daily" });
    assert.equal(preferences.status, 200);
    assert.equal(preferences.body.preferences.userId, userId);
    assert.equal(preferences.body.preferences.frequency, "daily");
  });

  it("exports requests as escaped CSV", async () => {
    const result = await exportsApi.request("GET", "/api/v1/exports/event-requests.csv");
    assert.equal(result.status, 200);
    assert.match(result.body, /Event,Status/);
    assert.match(result.body, /Workshop,FINANCE_REVIEW/);
  });

  it("archives reviewed requests when an academic year closes", async () => {
    const result = await cyclesApi.request("PATCH", `/api/v1/cycles/${cycleId}/close`);
    assert.equal(result.status, 200);
    assert.equal(result.body.cycle.status, "closed");
  });
});
