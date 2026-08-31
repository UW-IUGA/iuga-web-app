import assert from "node:assert/strict";
import mongoose from "mongoose";
import { after, before, describe, it } from "node:test";
import eventsRouter from "../routes/api/v1/controllers/events.js";
import { makeTestApi } from "./testApi.js";

const userId = "507f1f77bcf86cd799439011";
const eventId = "507f1f77bcf86cd799439012";
const participantId = "507f1f77bcf86cd799439013";

function query(value) {
  let populatedPath;
  return {
    populate(path) {
      populatedPath = path;
      return this;
    },
    async exec() {
      assert.equal(populatedPath, "eParticipants");
      return value;
    },
  };
}

function makeEvent(overrides = {}) {
  return {
    _id: eventId,
    eName: "Baseline event",
    eStartDate: new Date("2099-09-01T18:00:00Z"),
    eLocation: "Campus",
    eOrganizers: "IUGA",
    eDescription: "A baseline event",
    eLabels: ["community"],
    eParticipants: [],
    eShowParticipants: true,
    eRsvpEnabled: true,
    rsvpQuestions: [],
    ...overrides,
  };
}

describe("event Mongoose boundaries", () => {
  let api;

  before(async () => {
    api = await makeTestApi({
      router: eventsRouter,
      mountPath: "/api/v1/events",
      models: {},
      session: { isAuthenticated: true, userId },
    });
  });

  after(async () => {
    await api.close();
  });

  it("returns the documented event shape with RSVP state", async () => {
    const event = makeEvent({
      eParticipants: [
        { pUID: new mongoose.Types.ObjectId(userId) },
      ],
    });
    const result = await api.request("GET", "/api/v1/events", undefined, {
      models: {
        Events: { find: () => query([event]) },
      },
    });

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, [
      {
        eId: eventId,
        eName: "Baseline event",
        eStartDate: event.eStartDate.toISOString(),
        eLocation: "Campus",
        eOrganizers: "IUGA",
        eDescription: "A baseline event",
        eLabels: ["community"],
        hasRSVPd: true,
      },
    ]);
  });

  it("rejects an event lookup with a malformed id", async () => {
    const result = await api.request("GET", "/api/v1/events/id/not-an-id");

    assert.equal(result.status, 400);
  });

  it("converts the authenticated user id before saving an RSVP", async () => {
    const event = makeEvent();
    let savedParticipant;
    let eventSaved = false;

    event.save = async () => {
      eventSaved = true;
    };

    class Participant {
      constructor(fields) {
        savedParticipant = fields;
      }

      async save() {
        return { _id: participantId, ...savedParticipant };
      }
    }

    const result = await api.request(
      "POST",
      "/api/v1/events/rsvp",
      { eId: eventId, rsvpAnswers: [] },
      {
        models: {
          Events: { findById: () => query(event) },
          Participants: Participant,
        },
      },
    );

    assert.equal(result.status, 200);
    assert.equal(savedParticipant.pUID.toString(), userId);
    assert.equal(savedParticipant.eID, eventId);
    assert.equal(event.eParticipants[0]._id, participantId);
    assert.equal(eventSaved, true);
  });
});
