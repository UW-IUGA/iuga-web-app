import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import eventRequestsRouter from "../routes/api/v1/controllers/eventRequests.js";
import { makeTestApi } from "./testApi.js";

const organizerId = "507f1f77bcf86cd799439011";
const reviewerId = "507f1f77bcf86cd799439012";
const requestId = "507f1f77bcf86cd799439013";
const eventId = "507f1f77bcf86cd799439014";

const submittedRequest = {
  _id: requestId,
  requesterId: organizerId,
  organizerId,
  status: "submitted",
  eventName: "IUGA Workshop",
  requestingGroup: "Tech Committee",
  description: "A useful workshop",
  proposedStartDate: new Date("2026-09-01T18:00:00Z"),
  rsvpEnabled: true,
  rsvpQuestions: [],
  checkpoints: [
    "proposal",
    "meeting",
    "finance",
    "room",
    "marketing",
    "purchases",
    "review",
  ].map((key) => ({ key, status: "pending" })),
};

function query(value) {
  return {
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    async lean() {
      return value;
    },
  };
}

function permissionsFor(names) {
  return {
    find() {
      return {
        async populate() {
          return [{ roleId: { isActive: true, permissions: names } }];
        },
      };
    },
  };
}

function makeModels({ request = submittedRequest, permissions = [] } = {}) {
  return {
    Cycles: {
      findOne() {
        return {
          async lean() {
            return { _id: "507f1f77bcf86cd799439016", status: "active" };
          },
        };
      },
    },
    EventRequests: {
      async create(fields) {
        return { _id: requestId, ...fields };
      },
      findById() {
        return query(request);
      },
      find() {
        return query(request ? [request] : []);
      },
      async findOneAndUpdate(_filter, update) {
        return { ...request, ...update.$set };
      },
      async findByIdAndUpdate(_id, update) {
        return { ...request, ...update.$set };
      },
    },
    EventReviews: {
      async create(fields) {
        return { _id: "507f1f77bcf86cd799439015", ...fields };
      },
      async findOne() {
        return null;
      },
      find() {
        return query([]);
      },
    },
    Events: {
      async create(fields) {
        return { _id: eventId, ...fields };
      },
      async deleteOne() {},
    },
    RoleAssignments: permissionsFor(permissions),
  };
}

describe("event request API", () => {
  let api;

  before(async () => {
    api = await makeTestApi({
      router: eventRequestsRouter,
      mountPath: "/api/v1/event-requests",
      models: makeModels(),
      session: {
        isAuthenticated: true,
        isAdmin: true,
        userId: organizerId,
      },
    });
  });

  after(async () => {
    await api.close();
  });
  it("creates a request with session-derived requester and checkpoints", async () => {
    const result = await api.request(
      "POST",
      "/api/v1/event-requests",
      {
        eventName: "IUGA Workshop",
        requestingGroup: "Tech Committee",
        description: "A useful workshop",
        proposedStartDate: "2026-09-01T18:00:00Z",
        slideTemplate: {
          name: "Workshop",
          url: "https://onedrive.example/workshop",
          version: "1",
        },
      },
      { models: makeModels({ permissions: ["events.requests.create"] }) },
    );

    assert.equal(result.status, 201);
    assert.equal(result.body.eventRequest.requesterId, organizerId);
    assert.equal(result.body.eventRequest.organizerId, organizerId);
    assert.equal(result.body.eventRequest.status, "submitted");
    assert.equal(result.body.eventRequest.checkpoints.length, 7);
    assert.equal(result.body.eventRequest.slideTemplate.name, "Workshop");
  });

  it("returns configured slide templates", async () => {
    const previous = process.env.EVENT_SLIDE_TEMPLATES;
    process.env.EVENT_SLIDE_TEMPLATES = JSON.stringify([
      { name: "Workshop", url: "https://onedrive.example/workshop", version: "1" },
    ]);
    try {
      const result = await api.request(
        "GET",
        "/api/v1/event-requests/templates/slides",
        undefined,
        { models: makeModels({ permissions: ["events.requests.view"] }) },
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.templates[0].name, "Workshop");
    } finally {
      if (previous === undefined) delete process.env.EVENT_SLIDE_TEMPLATES;
      else process.env.EVENT_SLIDE_TEMPLATES = previous;
    }
  });

  it("blocks anonymous event requests", async () => {
    const result = await api.request(
      "POST",
      "/api/v1/event-requests",
      {},
      {
        models: makeModels(),
        session: { isAuthenticated: false },
      },
    );
    assert.equal(result.status, 401);
  });

  it("requires view permission to list event requests", async () => {
    const result = await api.request(
      "GET",
      "/api/v1/event-requests",
      undefined,
      { models: makeModels() },
    );
    assert.equal(result.status, 403);
  });

  it("requires leadership permission to request changes", async () => {
    const result = await api.request(
      "POST",
      `/api/v1/event-requests/${requestId}/request-changes`,
      { reason: "Please add a room estimate" },
      { models: makeModels({ permissions: ["events.leadership.approve"] }) },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.eventRequest.status, "changes_requested");
    assert.equal(result.body.eventRequest.changesRequestedBy, organizerId);
  });

  it("publishes an Events record when leadership approves", async () => {
    const result = await api.request(
      "POST",
      `/api/v1/event-requests/${requestId}/approve`,
      {},
      { models: makeModels({ permissions: ["events.leadership.approve"] }) },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.eventRequest.status, "approved");
    assert.equal(result.body.eventRequest.publishedEventId, eventId);
    assert.equal(result.body.eventRequest.checkpoints[0].key, "proposal");
    assert.equal(result.body.eventRequest.checkpoints[0].status, "completed");
    assert.equal(result.body.event.eName, "IUGA Workshop");
  });

  it("records the external review link and receipt actor", async () => {
    const result = await api.request(
      "PATCH",
      `/api/v1/event-requests/${requestId}/review-tracking`,
      { reviewLink: "https://forms.example/review", received: true },
      { models: makeModels({ permissions: ["events.review.manage"] }) },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.eventRequest.reviewLink, "https://forms.example/review");
    assert.equal(result.body.eventRequest.reviewReceivedBy, organizerId);
    assert.ok(result.body.eventRequest.reviewReceivedAt);
  });

  it("requires finance permission for budget changes", async () => {
    const result = await api.request(
      "PATCH",
      `/api/v1/event-requests/${requestId}/budget`,
      { allocatedCents: 15000 },
      { models: makeModels() },
    );
    assert.equal(result.status, 403);
  });

  it("accepts finance amounts as integer cents", async () => {
    const result = await api.request(
      "PATCH",
      `/api/v1/event-requests/${requestId}/budget`,
      { allocatedCents: 12550 },
      { models: makeModels({ permissions: ["events.finance.manage"] }) },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.eventRequest.finance.allocatedCents, 12550);
    const financeCheckpoint = result.body.eventRequest.checkpoints.find((checkpoint) => checkpoint.key === "finance");
    assert.equal(financeCheckpoint.status, "completed");
  });

  it("rejects floating-point finance amounts", async () => {
    const result = await api.request(
      "PATCH",
      `/api/v1/event-requests/${requestId}/budget`,
      { allocatedCents: 125.5 },
      { models: makeModels({ permissions: ["events.finance.manage"] }) },
    );
    assert.equal(result.status, 400);
  });

  it("allows the Finance Director to complete room booking", async () => {
    const result = await api.request(
      "PATCH",
      `/api/v1/event-requests/${requestId}/booking`,
      { location: "HUB 145", startDate: "2026-09-03T17:00:00Z", endDate: "2026-09-03T20:00:00Z" },
      {
        models: makeModels({ request: { ...submittedRequest, status: "FINANCE_REVIEW" }, permissions: ["events.finance.manage"] }),
      },
    );
    assert.equal(result.status, 200);
    assert.equal(result.body.eventRequest.booking.location, "HUB 145");
    assert.equal(result.body.eventRequest.checkpoints.find((checkpoint) => checkpoint.key === "room").status, "completed");
  });

  it("requires distinct organizer and member reviews", async () => {
    const models = makeModels({
      request: { ...submittedRequest, status: "approved" },
    });
    models.EventReviews.find = () =>
      query([
        { reviewerRole: "organizer" },
        { reviewerRole: "member" },
      ]);
    const result = await api.request(
      "POST",
      `/api/v1/event-requests/${requestId}/reviews`,
      { attendeeCount: 20 },
      {
        models: { ...models, RoleAssignments: makeModels({ permissions: ["events.review.manage"] }).RoleAssignments },
        session: { userId: reviewerId },
      },
    );
    assert.equal(result.status, 201);
    assert.equal(result.body.review.reviewerRole, "member");
    assert.equal(result.body.review.reviewerId, reviewerId);
  });

  it("deletes preview test data and recalculates the cycle budget", async () => {
    const previousEnvironment = process.env.DEPLOY_ENV;
    const previousPreview = process.env.ADMIN_PREVIEW;
    process.env.DEPLOY_ENV = "development";
    process.env.ADMIN_PREVIEW = "true";

    try {
      const models = makeModels({
        request: {
          ...submittedRequest,
          cycleId: "507f1f77bcf86cd799439016",
          status: "FINANCE_REVIEW",
        },
      });
      const deleted = {};
      models.EventRequests.deleteOne = async (filter) => {
        deleted.requestFilter = filter;
        return { deletedCount: 1 };
      };
      models.AuditEntries = {};
      models.Notifications = {};
      models.BudgetLedgerEntries = {};
      for (const [name, count] of [["AuditEntries", 3], ["Notifications", 2], ["EventReviews", 1], ["BudgetLedgerEntries", 1]]) {
        models[name].deleteMany = async (filter) => {
          deleted[name] = filter;
          return { deletedCount: count };
        };
      }
      models.BudgetLedgerEntries.find = () => query([{ amountCents: 2000, decision: "approved" }]);
      models.Cycles.findOneAndUpdate = async (filter, update) => {
        deleted.cycle = { filter, update };
        return { _id: filter._id, budgetCommittedCents: update.$set.budgetCommittedCents };
      };

      const result = await api.request(
        "DELETE",
        `/api/v1/event-requests/${requestId}/test-data`,
        { confirmation: "DELETE TEST REQUEST" },
        { models },
      );

      assert.equal(result.status, 200);
      assert.equal(result.body.deletedRequestId, requestId);
      assert.deepEqual(result.body.removed, {
        request: 1,
        auditEntries: 3,
        notifications: 2,
        reviews: 1,
        ledgerEntries: 1,
        publishedEvent: 0,
      });
      assert.equal(result.body.cycle.budgetCommittedCents, 2000);
      assert.equal(deleted.requestFilter._id, requestId);
      assert.equal(deleted.cycle.update.$set.budgetCommittedCents, 2000);
    } finally {
      if (previousEnvironment === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = previousEnvironment;
      if (previousPreview === undefined) delete process.env.ADMIN_PREVIEW;
      else process.env.ADMIN_PREVIEW = previousPreview;
    }
  });

  it("hides the test-data cleanup route outside preview mode", async () => {
    const previousEnvironment = process.env.DEPLOY_ENV;
    const previousPreview = process.env.ADMIN_PREVIEW;
    process.env.DEPLOY_ENV = "production";
    process.env.ADMIN_PREVIEW = "false";
    try {
      const result = await api.request(
        "DELETE",
        `/api/v1/event-requests/${requestId}/test-data`,
        { confirmation: "DELETE TEST REQUEST" },
      );
      assert.equal(result.status, 404);
    } finally {
      if (previousEnvironment === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = previousEnvironment;
      if (previousPreview === undefined) delete process.env.ADMIN_PREVIEW;
      else process.env.ADMIN_PREVIEW = previousPreview;
    }
  });
});
