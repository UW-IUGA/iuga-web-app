import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import eventsRouter from "../routes/api/v1/controllers/events.js";
import { makeTestApi, roleAssignmentsGranting } from "./testApi.js";

const eventId = "507f1f77bcf86cd799439011";
const otherEventId = "507f1f77bcf86cd799439012";
const participantId = "507f1f77bcf86cd799439013";
const userId = "507f1f77bcf86cd799439014";

describe("event participant ownership", () => {
  let api;
  let saved;

  before(async () => {
    const event = {
      _id: eventId,
      eParticipants: [participantId],
      async save() {
        saved = true;
      },
    };
    api = await makeTestApi({
      router: eventsRouter,
      mountPath: "/api/v1/events",
      models: {
        Events: { findById: async () => event },
        Participants: {
          findById: async () => ({ pUID: userId, eID: otherEventId }),
        },
      },
      session: { isAuthenticated: true, userId },
    });
  });

  after(async () => {
    await api.close();
  });

  it("does not withdraw a participant belonging to another event", async () => {
    const response = await api.request(
      "DELETE",
      `/api/v1/events/withdraw/${eventId}/${participantId}`,
    );

    assert.equal(response.status, 404);
    assert.equal(response.body.status, "error");
    assert.equal(saved, undefined);
  });
});

describe("viewing another student's participant record", () => {
  const otherUserId = "507f1f77bcf86cd799439015";
  const participants = {
    findById: async () => ({ pUID: otherUserId, eID: eventId, aList: [], isAnon: false }),
  };
  let api;

  before(async () => {
    api = await makeTestApi({
      router: eventsRouter,
      mountPath: "/api/v1/events",
      models: { Participants: participants, RoleAssignments: roleAssignmentsGranting([]) },
      session: { isAuthenticated: true, userId },
    });
  });

  after(async () => {
    await api.close();
  });

  it("refuses a student without the participant permission, even with an Admin account", async () => {
    const response = await api.request("GET", `/api/v1/events/${participantId}`, undefined, {
      session: { isAdmin: true, memberType: "Admin" },
    });
    assert.equal(response.status, 403);
  });

  it("shows the record to an officer with the participant permission", async () => {
    const response = await api.request("GET", `/api/v1/events/${participantId}`, undefined, {
      models: {
        Participants: participants,
        RoleAssignments: roleAssignmentsGranting(["events.participants.manage"]),
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.participant.userId, otherUserId);
  });
});
