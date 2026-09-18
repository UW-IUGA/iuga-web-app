import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import { connectToDatabase } from "../models.js";
import { eventsSchema, eventRequestsSchema } from "../schemas/schemas.js";

const TestEvents = mongoose.model("TestEvents", eventsSchema);
const TestEventRequests = mongoose.model("TestEventRequests", eventRequestsSchema);

const eventDefaults = {
    eName: "Baseline event",
    eOrganizers: "IUGA",
    eStartDate: new Date("2026-09-01T18:00:00Z"),
    eLocation: "Campus",
    eDescription: "A baseline event",
};
const requestDefaults = {
    requesterId: "507f1f77bcf86cd799439011",
    organizerId: "507f1f77bcf86cd799439011",
    eventName: "Baseline event",
    requestingGroup: "Tech Committee",
    description: "A baseline event request",
    proposedStartDate: new Date("2026-09-01T18:00:00Z"),
    submittedBy: "507f1f77bcf86cd799439011",
};

test("model registry module loads shared schemas", () => {
    assert.equal(typeof connectToDatabase, "function");
});

test("events and event requests default to hidden participants and no host", async () => {
    const event = new TestEvents(eventDefaults);
    assert.equal(event.eShowParticipants, false);
    assert.equal(event.eHost, null);
    await event.validate();

    const request = new TestEventRequests(requestDefaults);
    assert.equal(request.eShowParticipants, false);
    assert.equal(request.eHost, null);
    await request.validate();
});

test("a host snapshot without a name is rejected", async () => {
    const event = new TestEvents({
        ...eventDefaults,
        eHost: { userId: "507f1f77bcf86cd799439011" },
    });
    await assert.rejects(
        () => event.validate(),
        (error) => error.name === "ValidationError" && /eHost\.name/.test(error.message),
    );
});

test("a valid host snapshot passes validation", async () => {
    const event = new TestEvents({
        ...eventDefaults,
        eHost: { name: "Ada Lovelace", userId: "507f1f77bcf86cd799439011" },
    });
    await event.validate();

    assert.equal(event.eHost.name, "Ada Lovelace");
    assert.equal(event.eHost.userId.toString(), "507f1f77bcf86cd799439011");
});
