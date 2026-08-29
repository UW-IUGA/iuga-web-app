import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import eventRequestsRouter from "../routes/api/v1/controllers/eventRequests.js";
import { makeTestApi } from "./testApi.js";

const userId = "507f1f77bcf86cd799439011";
const requestId = "507f1f77bcf86cd799439012";
const cycleId = "507f1f77bcf86cd799439013";
const eventId = "507f1f77bcf86cd799439014";

function chain(value) {
  return {
    populate() { return this; },
    sort() { return this; },
    async lean() { return value; },
  };
}

function makeWorkflowModels({ permissions = [], initialStatus = "PVP_REVIEW", eventDate = "2026-09-01T18:00:00Z" } = {}) {
  const audits = [];
  const ledger = [];
  const reviews = [];
  let request = {
    _id: requestId,
    requesterId: userId,
    organizerId: userId,
    cycleId,
    status: initialStatus,
    title: "Autumn Workshop",
    eventName: "Autumn Workshop",
    purpose: "A workshop for students.",
    description: "A workshop for students.",
    requestingGroup: "IUGA",
    eventDate: new Date(eventDate),
    proposedStartDate: new Date(eventDate),
    location: "HUB 145",
    estimatedAttendance: 40,
    fundingRequestedCents: 25000,
    reviewComments: [],
    checkpoints: [],
  };
  let committed = 10000;
  const models = {
    Cycles: {
      findOne() { return { async lean() { return { _id: cycleId, status: "active" }; } }; },
      async findOneAndUpdate(filter, update) {
        const amount = update.$inc?.budgetCommittedCents || 0;
        if (filter.$expr && committed + amount > 50000) return null;
        committed += amount;
        return { _id: cycleId, budgetTotalCents: 50000, budgetCommittedCents: committed };
      },
    },
    RoleAssignments: {
      find() {
        return { async populate() { return [{ cycleId, roleId: { isActive: true, permissions } }]; } };
      },
    },
    EventRequests: {
      async create(fields) { request = { _id: requestId, ...fields }; return request; },
      findById() { return chain(request); },
      findOneAndUpdate(filter, update) {
        if (filter.status && request.status !== filter.status) return null;
        request = { ...request, ...update.$set };
        return request;
      },
    },
    AuditEntries: {
      async create(fields) { audits.push({ _id: String(audits.length + 1), ...fields }); return audits.at(-1); },
      find() { return chain(audits); },
    },
    BudgetLedgerEntries: {
      async findOne(filter) { return ledger.find((entry) => entry.eventRequestId === filter.eventRequestId) || null; },
      async create(fields) { ledger.push(fields); return fields; },
    },
    EventReviews: {
      async findOne() { return reviews[0] || null; },
      async create(fields) { const review = { _id: String(reviews.length + 1), ...fields }; reviews.push(review); return review; },
      find() { return chain(reviews); },
    },
    Events: {
      async create(fields) { return { _id: eventId, ...fields }; },
    },
  };
  return { models, getRequest: () => request, audits, ledger, getCommitted: () => committed };
}

describe("canonical event workflow", () => {
  let api;
  const fixture = makeWorkflowModels({ permissions: [
    "events.requests.view",
    "events.requests.create",
    "events.requests.edit",
    "events.leadership.approve",
    "events.meeting.manage",
    "events.finance.manage",
    "events.marketing.manage",
    "events.publication.manage",
    "events.review.manage",
  ] });

  before(async () => {
    api = await makeTestApi({
      router: eventRequestsRouter,
      mountPath: "/api/v1/event-requests",
      models: fixture.models,
      session: { isAuthenticated: true, userId },
    });
  });

  after(async () => api.close());

  it("creates a cycle-scoped request with the required canonical fields", async () => {
    const result = await api.request("POST", "/api/v1/event-requests", {
      title: "Autumn Workshop",
      requestingGroup: "IUGA",
      eventDate: "2026-09-01",
      eventTime: "18:00",
      location: "HUB 145",
      purpose: "A workshop for students.",
      estimatedAttendance: 40,
      fundingRequestedCents: 25000,
    });

    assert.equal(result.status, 201);
    assert.equal(result.body.eventRequest.status, "PVP_REVIEW");
    assert.equal(result.body.eventRequest.cycleId, cycleId);
    assert.equal(result.body.eventRequest.shortNotice, true);
  });

  it("allows one P/VP officer to advance a request to the agenda", async () => {
    const result = await api.request("POST", `/api/v1/event-requests/${requestId}/advance`, { agendaDate: "2026-09-03T18:00:00Z" });

    assert.equal(result.status, 200);
    assert.equal(result.body.eventRequest.status, "AGENDA");
    assert.equal(fixture.audits.at(-1).action, "pvp_advance");
  });

  it("requires an agenda note and routes proceed to finance", async () => {
    const missingNote = await api.request("POST", `/api/v1/event-requests/${requestId}/agenda-outcome`, { outcome: "proceed" });
    assert.equal(missingNote.status, 400);

    const result = await api.request("POST", `/api/v1/event-requests/${requestId}/agenda-outcome`, { outcome: "proceed", note: "The board approved the concept." });
    assert.equal(result.status, 200);
    assert.equal(result.body.eventRequest.status, "FINANCE_REVIEW");
  });

  it("commits partial funding against the academic-year budget", async () => {
    const result = await api.request("POST", `/api/v1/event-requests/${requestId}/finance`, { decision: "approve_partial", approvedAmountCents: 20000, note: "Reduced catering scope." });

    assert.equal(result.status, 200);
    assert.equal(result.body.eventRequest.status, "MARKETING_QUEUED");
    assert.equal(fixture.ledger[0].amountCents, 20000);
    assert.equal(fixture.getCommitted(), 30000);
  });

  it("requires PR completion before publication", async () => {
    const marketing = await api.request("POST", `/api/v1/event-requests/${requestId}/marketing-complete`);
    assert.equal(marketing.status, 200);
    assert.equal(marketing.body.eventRequest.status, "SCHEDULED");

    const publication = await api.request("POST", `/api/v1/event-requests/${requestId}/publish`);
    assert.equal(publication.status, 200);
    assert.equal(publication.body.event._id, eventId);
  });

  it("rejects an illegal transition and records a completed review", async () => {
    const illegal = await api.request("POST", `/api/v1/event-requests/${requestId}/advance`);
    assert.equal(illegal.status, 409);

    fixture.getRequest().status = "SCHEDULED";
    fixture.getRequest().eventDate = new Date("2020-01-01T00:00:00Z");
    const result = await api.request("POST", `/api/v1/event-requests/${requestId}/reviews`, {
      pros: "Good turnout",
      cons: "Room was tight",
      actualAttendance: 35,
      repeatRecommendation: "with_changes",
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.eventRequest.status, "REVIEWED");
    assert.equal(fixture.audits.at(-1).action, "review_submitted");
  });
});
