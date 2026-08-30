import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import eventsRouter from "../routes/api/v1/controllers/events.js";
import eventRequestsRouter from "../routes/api/v1/controllers/eventRequests.js";
import feedbackRouter from "../routes/api/v1/controllers/feedback.js";
import userRouter from "../routes/api/v1/controllers/user.js";
import { makeTestApi } from "./testApi.js";
const validId = "507f1f77bcf86cd799439011";

function unusedModel() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("database should not be reached for invalid input");
      },
    },
  );
}

describe("request validation", () => {
  let eventsApi;
  let eventRequestsApi;
  let feedbackApi;
  let userApi;
  before(async () => {
    eventsApi = await makeTestApi({
      router: eventsRouter,
      mountPath: "/api/v1/events",
      models: {
        Events: unusedModel(),
        Participants: unusedModel(),
      },
      session: { isAuthenticated: true, userId: validId },
    });
    eventRequestsApi = await makeTestApi({
      router: eventRequestsRouter,
      mountPath: "/api/v1/event-requests",
      models: { EventRequests: unusedModel() },
      session: { isAuthenticated: true, isAdmin: true, userId: validId },
    });
    feedbackApi = await makeTestApi({
      router: feedbackRouter,
      mountPath: "/api/v1/feedback",
      models: { Feedback: unusedModel() },
      session: { isAuthenticated: true, isAdmin: true, userId: validId },
    });
    userApi = await makeTestApi({
      router: userRouter,
      mountPath: "/api/v1/user",
      models: { Users: unusedModel() },
      session: { isAuthenticated: true, userId: validId },
    });
  });

  after(async () => {
    await Promise.all([
      eventsApi.close(),
      eventRequestsApi.close(),
      feedbackApi.close(),
      userApi.close(),
    ]);
  });
  it("rejects malformed event and participant identifiers", async () => {
    for (const path of [
      "/api/v1/events/id/not-an-object-id",
      "/api/v1/events/not-an-object-id",
      "/api/v1/events/withdraw/not-an-object-id/" + validId,
      "/api/v1/events/withdraw/" + validId + "/not-an-object-id",
    ]) {
      const response = await eventsApi.request(
        path.includes("/withdraw/") ? "DELETE" : "GET",
        path,
      );
      assert.equal(response.status, 400, path);
      assert.equal(response.body.status, "error", path);
    }
  });

  it("rejects malformed RSVP bodies before database access", async () => {
    const response = await eventsApi.request("POST", "/api/v1/events/rsvp", {
      eId: validId,
      rsvpAnswers: { qId: "question", aString: "answer" },
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      status: "error",
      message: "rsvpAnswers must be an array",
    });
  });

  it("rejects nested event-request values with the API error envelope", async () => {
    const response = await eventRequestsApi.request("POST", "/api/v1/event-requests", {
      eventName: "Workshop",
      requestingGroup: "Committee",
      description: "Description",
      proposedStartDate: "2026-09-01T18:00:00.000Z",
      rsvpQuestions: [{ qId: "question", qString: 42 }],
    });

    assert.equal(response.status, 400);
    assert.equal(response.body.status, "error");
  });

  it("rejects malformed feedback identifiers before deletion", async () => {
    const response = await feedbackApi.request("DELETE", "/api/v1/feedback/?fID=not-an-object-id");

    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      status: "error",
      message: "Invalid feedback ID",
    });
  });

  it("rejects malformed user identifiers before database access", async () => {
    for (const method of ["GET", "POST"]) {
      const response = await userApi.request(
        method,
        "/api/v1/user/not-an-object-id",
        method === "POST" ? {} : undefined,
      );

      assert.equal(response.status, 400);
      assert.deepEqual(response.body, {
        status: "error",
        message: "Invalid user ID",
      });
    }
  });
});
