import assert from "node:assert/strict";
import mongoose from "mongoose";
import { after, before, describe, it } from "node:test";
import {
  eventsSchema,
  eventRequestsSchema,
  eventReviewsSchema,
  participantsSchema,
  rolesSchema,
  usersSchema,
} from "../schemas/schemas.js";
import {
  cleanupTestDatabase,
  clearTestDatabase,
  connectTestDatabase,
} from "./mongoose-test-db.js";

const hasTestDatabase = Boolean(process.env.TEST_DB_URI?.trim());
const modelNames = [
  "Events",
  "EventRequests",
  "EventReviews",
  "Participants",
  "Roles",
  "Users",
];
const userId = new mongoose.Types.ObjectId();
const eventRequestId = new mongoose.Types.ObjectId();

function model(name, schema) {
  return mongoose.models[name] ?? mongoose.model(name, schema);
}

function deleteIntegrationModels() {
  for (const name of modelNames) {
    if (mongoose.models[name]) mongoose.deleteModel(name);
  }
}

describe("Mongoose integration behavior", { skip: !hasTestDatabase }, () => {
  let Events;
  let EventRequests;
  let EventReviews;
  let Participants;
  let Roles;
  let Users;

  before(async () => {
    await connectTestDatabase(mongoose);
    await clearTestDatabase(mongoose);

    Events = model("Events", eventsSchema);
    EventRequests = model("EventRequests", eventRequestsSchema);
    EventReviews = model("EventReviews", eventReviewsSchema);
    Participants = model("Participants", participantsSchema);
    Roles = model("Roles", rolesSchema);
    Users = model("Users", usersSchema);

    await Promise.all([EventReviews.init(), Roles.init()]);
  });

  after(async () => {
    await cleanupTestDatabase(mongoose);
    deleteIntegrationModels();
  });

  it("preserves populated event response arrays when references are missing", async () => {
    const missingParticipantId = new mongoose.Types.ObjectId();
    const event = await Events.create({
      eName: "Populate baseline",
      eOrganizers: "IUGA",
      eStartDate: new Date("2099-09-01T18:00:00Z"),
      eLocation: "Campus",
      eDescription: "Checks missing references",
      eParticipants: [missingParticipantId],
    });

    const populated = await Events.findById(event._id)
      .populate("eParticipants")
      .exec();

    assert.deepEqual(populated.eParticipants, []);
  });

  it("updates timestamped roles and enforces update validators", async () => {
    const role = await Roles.create({
      roleName: "Baseline role",
      roleKey: `baseline-${roleKey()}`,
    });
    const originalUpdatedAt = role.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 10));
    const updated = await Roles.findByIdAndUpdate(
      role._id,
      { $set: { roleName: "Updated baseline role" } },
      { returnDocument: "after", runValidators: true },
    ).exec();

    assert.equal(updated.roleName, "Updated baseline role");
    assert.equal(updated.createdAt.getTime(), role.createdAt.getTime());
    assert.ok(updated.updatedAt > originalUpdatedAt);

    await assert.rejects(
      Roles.findByIdAndUpdate(
        role._id,
        { $set: { roleName: "" } },
        { returnDocument: "after", runValidators: true },
      ).exec(),
      /required/,
    );
  });

  it("rejects duplicate role keys through a unique index", async () => {
    const roleKeyValue = `duplicate-${roleKey()}`;
    await Roles.create({
      roleName: "First duplicate role",
      roleKey: roleKeyValue,
    });

    await assert.rejects(
      Roles.create({
        roleName: "Second duplicate role",
        roleKey: roleKeyValue,
      }),
      (error) => error?.code === 11000,
    );
  });

  it("rejects duplicate event reviews through unique indexes", async () => {
    const review = {
      eventRequestId,
      reviewerId: userId,
      reviewerRole: "organizer",
    };
    await EventReviews.create(review);

    await assert.rejects(
      EventReviews.create({
        ...review,
        reviewerId: new mongoose.Types.ObjectId(),
      }),
      (error) => error?.code === 11000,
    );

    await assert.rejects(
      EventReviews.create({
        ...review,
        reviewerRole: "member",
      }),
      (error) => error?.code === 11000,
    );
  });

  it("validates array-filtered event request updates", async () => {
    const request = await EventRequests.create({
      requesterId: userId,
      organizerId: userId,
      eventName: "Baseline request",
      requestingGroup: "IUGA",
      description: "Checks array filters",
      proposedStartDate: new Date("2099-09-01T18:00:00Z"),
      submittedBy: userId,
      checkpoints: [{ key: "review", status: "pending" }],
    });

    await assert.rejects(
      EventRequests.findByIdAndUpdate(
        request._id,
        { $set: { "checkpoints.$[checkpoint].status": "invalid" } },
        {
          arrayFilters: [{ "checkpoint.key": "review" }],
          runValidators: true,
        },
      ).exec(),
      /enum/,
    );

    const updated = await EventRequests.findByIdAndUpdate(
      request._id,
      { $set: { "checkpoints.$[checkpoint].status": "completed" } },
      {
        arrayFilters: [{ "checkpoint.key": "review" }],
        returnDocument: "after",
        runValidators: true,
      },
    ).exec();

    assert.equal(updated.checkpoints[0].status, "completed");
  });

  it("can create referenced user and participant models together", async () => {
    const user = await Users.create({
      uEmail: `baseline-${roleKey()}@example.com`,
      uDisplayName: "Baseline user",
    });
    const event = await Events.create({
      eName: "Participant baseline",
      eOrganizers: "IUGA",
      eStartDate: new Date("2099-09-01T18:00:00Z"),
      eLocation: "Campus",
      eDescription: "Checks participant references",
    });
    const participant = await Participants.create({
      pUID: user._id,
      eID: event._id,
      rsvpAnswers: [],
    });

    assert.equal(participant.eID.toString(), event._id.toString());
  });
});

function roleKey() {
  return new mongoose.Types.ObjectId().toString().slice(-8);
}
