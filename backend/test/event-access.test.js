import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import eventsRouter from "../routes/api/v1/controllers/events.js";
import { makeTestApi } from "./testApi.js";

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
