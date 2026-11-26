import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { eventRequestsSchema, eventsSchema, usersSchema } from "../schemas/schemas.js";
import eventRequestsRouter from "../routes/api/v1/controllers/eventRequests.js";
import { createDiscordApprovals } from "../discord/events/approvals.js";
import { createServerRoles } from "../discord/roles.js";
import { discordSubmissionsSchema } from "../discord/events/submissions.js";
import { makeTestApi, roleAssignmentsGranting } from "./testApi.js";

const uri = process.env.SHOP_REPLSET_URI;
const mountPath = "/api/v1/event-requests";
const officerId = new mongoose.Types.ObjectId();
const modRoleId = "123456789012345678";
const reviewerDiscordId = "234567890123456789";
const submitterDiscordId = "345678901234567890";
const start = new Date("2026-09-01T18:00:00Z");

function failAfterInsert() {
  throw new Error("simulated failure after the event insert");
}

describe("event approval against a MongoDB replica set", { skip: !uri }, () => {
  let connection, models, api;
  let afterEventInsert, afterApprovalUpdate, announcementCount;

  before(async () => {
    connection = await mongoose.createConnection(uri, { dbName: `event_approval_${randomUUID()}` }).asPromise();
    const eventSchema = eventsSchema.clone();
    eventSchema.post("save", async function () {
      await afterEventInsert?.();
    });
    const requestSchema = eventRequestsSchema.clone();
    requestSchema.post("findOneAndUpdate", async function (request) {
      if (request?.status === "approved") await afterApprovalUpdate?.();
    });
    models = {
      Events: connection.model("Events", eventSchema),
      EventRequests: connection.model("EventRequests", requestSchema),
      DiscordEventSubmissions: connection.model("DiscordEventSubmissions", discordSubmissionsSchema),
      Users: connection.model("Users", usersSchema),
      RoleAssignments: roleAssignmentsGranting(["events.leadership.approve"]),
    };
    await Promise.all([models.Events.init(), models.EventRequests.init(), models.DiscordEventSubmissions.init()]);
    api = await makeTestApi({
      router: eventRequestsRouter,
      mountPath,
      models,
      session: { isAuthenticated: true, userId: String(officerId) },
    });
  });

  beforeEach(async () => {
    afterEventInsert = null;
    afterApprovalUpdate = null;
    announcementCount = 0;
    await Promise.all([models.Events.deleteMany(), models.EventRequests.deleteMany(), models.DiscordEventSubmissions.deleteMany()]);
  });

  after(async () => {
    await api?.close();
    if (connection?.readyState === 1) await connection.dropDatabase();
    await connection?.close();
  });

  async function submitWebRequest() {
    const request = await models.EventRequests.create({
      requesterId: officerId, organizerId: officerId, submittedBy: officerId,
      eventName: "Workshop", requestingGroup: "IUGA", description: "Practice together",
      proposedStartDate: start,
    });
    return { request, approve: () => api.request("POST", `${mountPath}/${request.id}/approve`, {}) };
  }

  async function submitDiscordEvent() {
    const request = await models.DiscordEventSubmissions.create({
      submitterDiscordId, rsoKey: "iuga", rsoName: "IUGA", eName: "Workshop",
      eStartDate: start, eDescription: "Practice together", eLocation: "Mary Gates Hall", eLabels: ["Academic"],
    });
    const flow = createDiscordApprovals({
      models,
      roles: createServerRoles({ modRoleId }),
      config: { announcementChannelId: "123" },
      client: { async postMessage() { announcementCount++; return { id: "456" }; } },
    });
    const approve = (reviewer = reviewerDiscordId) => flow.handle({
      type: 3,
      member: { user: { id: reviewer, username: "Reviewer" }, roles: [modRoleId] },
      data: { custom_id: `approve:${request.id}` },
    });
    return { request, approve };
  }

  it("rolls back web approval and the event when the insert reports a failure; a retry can publish", async (t) => {
    t.mock.method(console, "error", () => {});
    const { request, approve } = await submitWebRequest();
    afterEventInsert = failAfterInsert;
    assert.equal((await approve()).status, 500);
    const unchanged = await models.EventRequests.findById(request.id);
    assert.equal(unchanged.status, "submitted");
    assert.equal(unchanged.publishedEventId, null);
    assert.equal(await models.Events.countDocuments(), 0);

    afterEventInsert = null;
    const result = await approve();
    assert.equal(result.status, 200);
    assert.equal(result.body.eventRequest.publishedEventId, result.body.event._id);
    assert.equal(await models.Events.countDocuments(), 1);
  });

  it("rolls back both writes when the approval update fails after saving", async (t) => {
    t.mock.method(console, "error", () => {});
    const { request, approve } = await submitWebRequest();
    afterApprovalUpdate = () => { throw new Error("simulated failure after the approval update"); };

    assert.equal((await approve()).status, 500);
    const unchanged = await models.EventRequests.findById(request.id);
    assert.equal(unchanged.status, "submitted");
    assert.equal(unchanged.publishedEventId, null);
    assert.equal(await models.Events.countDocuments(), 0);
  });

  it("publishes exactly one linked event when two officers approve the same web request", async () => {
    const { request, approve } = await submitWebRequest();
    const outcomes = await Promise.all([approve(), approve()]);
    assert.deepEqual(outcomes.map(({ status }) => status).sort(), [200, 409]);
    const saved = await models.EventRequests.findById(request.id);
    assert.equal(saved.status, "approved");
    assert.ok(await models.Events.exists({ _id: saved.publishedEventId }));
    assert.equal(await models.Events.countDocuments(), 1);
  });

  it("keeps an in-flight event private and does not overwrite a concurrent denial", { timeout: 5_000 }, async () => {
    const { request, approve } = await submitWebRequest();
    const inserted = Promise.withResolvers();
    const resume = Promise.withResolvers();
    afterEventInsert = () => {
      inserted.resolve();
      return resume.promise;
    };
    const approval = approve();
    try {
      await Promise.race([inserted.promise, approval.then(() => assert.fail("approval ended before inserting"))]);
      assert.equal(await models.Events.countDocuments(), 0);
      assert.equal((await models.EventRequests.findById(request.id)).status, "submitted");
      const denial = await api.request("POST", `${mountPath}/${request.id}/deny`, { reason: "Room unavailable" });
      assert.equal(denial.status, 200);
    } finally {
      resume.resolve();
      await approval;
    }
    assert.equal((await approval).status, 409);
    assert.equal((await models.EventRequests.findById(request.id)).status, "denied");
    assert.equal(await models.Events.countDocuments(), 0);
  });

  it("doesn't announce a rolled-back Discord event or announce twice on concurrent retries", async (t) => {
    t.mock.method(console, "error", () => {});
    const { request, approve } = await submitDiscordEvent();
    assert.match((await approve(submitterDiscordId)).data.content, /cannot approve your own event/);
    afterEventInsert = failAfterInsert;
    assert.equal((await approve()).type, 4);
    const unchanged = await models.DiscordEventSubmissions.findById(request.id);
    assert.equal(unchanged.status, "pending");
    assert.equal(unchanged.publishedEventId, undefined);
    assert.equal(await models.Events.countDocuments(), 0);
    assert.equal(announcementCount, 0);

    afterEventInsert = null;
    const outcomes = await Promise.all([approve(), approve()]);
    assert.deepEqual(outcomes.map(({ type }) => type).sort(), [4, 7]);
    const saved = await models.DiscordEventSubmissions.findById(request.id);
    assert.equal(saved.status, "approved");
    assert.ok(await models.Events.exists({ _id: saved.publishedEventId }));
    assert.equal(await models.Events.countDocuments(), 1);
    assert.equal(announcementCount, 1);
  });
});
