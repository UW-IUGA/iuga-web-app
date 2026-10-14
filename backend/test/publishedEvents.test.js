import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";
import { publishedEvents, seedPublishedEvents } from "../publishedEvents.js";
import { eventsSchema } from "../schemas/schemas.js";

describe("published events", () => {
  it("publishes drop-in Snack & Build through finals, skipping Thanksgiving", () => {
    const sessions = publishedEvents.filter((event) => event.eName === "Snack & Build");
    assert.equal(sessions.length, 19);
    assert.equal(sessions[0].eStartDate.toISOString(), "2026-10-13T19:00:00.000Z");
    assert.equal(sessions.at(-1).eStartDate.toISOString(), "2026-12-17T23:30:00.000Z");
    assert.ok(!sessions.some((event) => event.eStartDate.toISOString().startsWith("2026-11-26")));
    assert.ok(sessions.some((event) => event.eStartDate.toISOString() === "2026-12-15T20:00:00.000Z"));
    for (const event of sessions) {
      assert.equal(event.eOrganizers, "iStartup Lab");
      assert.equal(event.eLocation, "iStartup Lab, MGH 310");
      assert.equal(event.eRsvpEnabled, false);
      assert.match(event.eDescription, /Drop in; no RSVP required/);
      assert.equal(event.eThumbnailPath, "/assets/events/snack-and-build-page-1.webp");
      if (event.eStartDate.getUTCDay() === 2) {
        assert.equal(event.eEndDate - event.eStartDate, 75 * 60_000);
      } else {
        assert.equal(event.eStartDate.getUTCDay(), 4);
        assert.equal(event.eEndDate, undefined);
      }
    }
  });

  it("inserts each event only when its id is not in the database yet", async () => {
    const calls = [];
    const events = {
      updateOne: async (filter, update, options) => calls.push({ filter, update, options }),
    };

    await seedPublishedEvents(events);

    assert.equal(calls.length, publishedEvents.length);
    calls.forEach(({ filter, update, options }, position) => {
      assert.deepEqual(filter, { _id: publishedEvents[position]._id });
      assert.deepEqual(Object.keys(update), ["$setOnInsert"]);
      assert.equal(update.$setOnInsert._id, undefined);
      assert.equal(update.$setOnInsert.eName, publishedEvents[position].eName);
      assert.deepEqual(options, { upsert: true });
    });
  });

  it("gives every event its own valid id", () => {
    const ids = publishedEvents.map((event) => event._id);

    ids.forEach((id) => assert.ok(mongoose.isValidObjectId(id), `${id} is not a valid id`));
    assert.equal(new Set(ids).size, ids.length);
  });

  it("satisfies the Events schema", () => {
    publishedEvents.forEach((event) => {
      const error = new mongoose.Document(event, eventsSchema).validateSync();

      assert.equal(error, undefined, `${event.eName}: ${error?.message}`);
    });
  });

  it("serves every poster from the frontend's public events folder", () => {
    publishedEvents
      .filter((event) => event.eThumbnailPath)
      .forEach((event) => assert.match(event.eThumbnailPath, /^\/assets\/events\/[a-z0-9-]+\.webp$/));
  });

  it("uses only the public category names", () => {
    publishedEvents.forEach((event) => {
      event.eLabels.forEach((label) => assert.ok(["Academic", "Social", "Professional"].includes(label), label));
    });
  });

  it("does not offer both the built-in RSVP and an outside RSVP link", () => {
    publishedEvents
      .filter((event) => event.eAltLink)
      .forEach((event) => {
        assert.equal(event.eRsvpEnabled, false, event.eName);
        assert.match(event.eAltLink.url, /^https:\/\//);
        assert.ok(event.eAltLink.title);
      });
  });
});
