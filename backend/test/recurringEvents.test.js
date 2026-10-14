import assert from "node:assert/strict";
import { it } from "node:test";
import { createRecurringEvents } from "../../shared/recurringEvents.mjs";

it("expands selected weekdays with their own times, inclusive bounds, and excluded dates", () => {
  const events = createRecurringEvents({
    event: { eName: "Build time" },
    startsOn: "2026-10-13",
    endsOn: "2026-10-22",
    schedule: [
      { weekday: 2, startTime: "12:00", endTime: "13:15" },
      { weekday: 4, startTime: "15:30" },
    ],
    excludeDates: ["2026-10-20"],
  });
  assert.deepEqual(events.map((event) => event.eStartDate.toISOString()), [
    "2026-10-13T19:00:00.000Z",
    "2026-10-15T22:30:00.000Z",
    "2026-10-22T22:30:00.000Z",
  ]);
  assert.equal(events[0].eEndDate.toISOString(), "2026-10-13T20:15:00.000Z");
  assert.equal(events[1].eEndDate, undefined);
  assert.ok(events.every((event) => event.eName === "Build time"));
});

it("supports Wednesday and keeps Seattle noon unchanged across daylight saving", () => {
  const events = createRecurringEvents({
    event: { eName: "Wednesday session" },
    startsOn: "2026-10-28",
    endsOn: "2026-11-04",
    schedule: [{ weekday: 3, startTime: "12:00" }],
  });
  assert.deepEqual(events.map((event) => event.eStartDate.toISOString()), [
    "2026-10-28T19:00:00.000Z",
    "2026-11-04T20:00:00.000Z",
  ]);
});

it("returns no occurrences when no scheduled weekday falls inside the range", () => {
  assert.deepEqual(createRecurringEvents({
    event: { eName: "Wednesday session" },
    startsOn: "2026-10-13",
    endsOn: "2026-10-13",
    schedule: [{ weekday: 3, startTime: "12:00" }],
  }), []);
});
