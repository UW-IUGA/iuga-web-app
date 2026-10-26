import { describe, expect, it } from "vitest";
import {
    buildMonthGrid,
    colorForLabels,
    EVENT_LABELS,
    formatEventDateTime,
    groupByMonth,
    normalizeEvent,
    zonedParts,
} from "./calendar";

describe("normalizeEvent", () => {
    it("extracts the calendar position from the start date", () => {
        const event = normalizeEvent({
            eId: "abc",
            eName: "Study Jam",
            eStartDate: "2024-04-04T20:30:00.000Z",
        });

        expect(event.id).toBe("abc");
        expect(event.name).toBe("Study Jam");
        expect(event.year).toBe(2024);
        expect(event.month).toBe(3);
        expect(event.day).toBe(4);
    });

    it("tolerates the _id.$oid shape used by mockEvent", () => {
        const event = normalizeEvent({
            _id: { $oid: "664d5097" },
            eName: "Panel",
            eStartDate: "2025-06-01T00:30:00.000+00:00",
        });

        expect(event.id).toBe("664d5097");
    });

    it("leaves end null when the source has no eEndDate", () => {
        const event = normalizeEvent({
            eId: "abc",
            eName: "Panel",
            eStartDate: "2025-06-01T00:30:00.000Z",
        });

        expect(event.end).toBeNull();
    });

    it("defaults labels to an empty array", () => {
        const event = normalizeEvent({
            eId: "abc",
            eName: "Panel",
            eStartDate: "2025-06-01T00:30:00.000Z",
        });

        expect(event.labels).toEqual([]);
    });
});

describe("buildMonthGrid", () => {
    it("always returns 6 rows of 7 cells", () => {
        const rows = buildMonthGrid(2024, 3, []);

        expect(rows).toHaveLength(6);
        expect(rows.every((row) => row.length === 7)).toBe(true);
    });

    it("marks the leading cells of a Monday-start month as out of range", () => {
        const rows = buildMonthGrid(2024, 3, []);

        // April 1 2024 is a Monday, so exactly one leading cell belongs to March.
        expect(rows[0][0].inMonth).toBe(false);
        expect(rows[0][1].inMonth).toBe(true);
        expect(rows[0][1].day).toBe(1);
    });

    it("places an event on its own day cell", () => {
        const event = normalizeEvent({
            eId: "abc",
            eName: "Game Night",
            eStartDate: "2024-04-21T14:00:00.000Z",
        });

        const rows = buildMonthGrid(2024, 3, [event]);
        const cell = rows.flat().find((c) => c.events.length > 0);

        expect(cell.day).toBe(21);
    });

    it("leaves every cell empty when the month has no events", () => {
        const rows = buildMonthGrid(2024, 3, []);

        expect(rows.flat().every((cell) => cell.events.length === 0)).toBe(true);
    });

    it("ignores events belonging to a different month", () => {
        const mayEvent = normalizeEvent({
            eId: "may",
            eName: "May event",
            eStartDate: "2024-05-21T14:00:00.000Z",
        });

        const rows = buildMonthGrid(2024, 3, [mayEvent]);

        expect(rows.flat().every((cell) => cell.events.length === 0)).toBe(true);
    });

    it("carries the real date of every cell, including the spill from adjacent months", () => {
        // April 2024 begins on a Monday, so cell 0 is Sun Mar 31.
        const rows = buildMonthGrid(2024, 3, []);
        const cells = rows.flat();

        expect(zonedParts(cells[0].date)).toMatchObject({ year: 2024, month: 2, day: 31, hour: 0 });
        expect(zonedParts(cells[1].date)).toMatchObject({ year: 2024, month: 3, day: 1 });
        expect(zonedParts(cells[41].date)).toMatchObject({ year: 2024, month: 4, day: 11 });
    });

    it("keeps every cell date one day after the one before it", () => {
        const rows = buildMonthGrid(2024, 3, []);
        const days = rows.flat().map((cell) => cell.date.getTime());
        const gaps = days.slice(1).map((time, index) => time - days[index]);

        // April 2024 has no DST transition, so every step is exactly 24 hours.
        expect(gaps.every((gap) => gap === 86_400_000)).toBe(true);
    });
});

describe("groupByMonth", () => {
    it("buckets events under the month they fall in", () => {
        const raw = [
            { eId: "a", eName: "A", eStartDate: "2024-04-21T14:00:00.000Z" },
            { eId: "b", eName: "B", eStartDate: "2024-04-25T12:30:00.000Z" },
            { eId: "c", eName: "C", eStartDate: "2024-05-22T05:30:00.000Z" },
        ];

        const months = groupByMonth(raw);

        expect(months).toHaveLength(2);
        const april = months.find((m) => m.month === 3);
        const may = months.find((m) => m.month === 4);

        expect(april.events).toHaveLength(2);
        expect(may.events).toHaveLength(1);
        expect(april.year).toBe(2024);
    });

    it("keeps a full year of events in one bucket per month", () => {
        const raw = Array.from({ length: 12 }, (_, month) => ({
            eId: `e${month}`,
            eName: `Event ${month}`,
            eStartDate: new Date(Date.UTC(2024, month, 15, 12)).toISOString(),
        }));

        expect(groupByMonth(raw)).toHaveLength(12);
    });

    it("returns months in descending order", () => {
        // Months are 0-indexed and unpadded, so string-sorting the bucket keys
        // puts Oct/Nov after Mar. Folding to a single ordinal fixes it.
        const raw = Array.from({ length: 12 }, (_, month) => ({
            eId: `e${month}`,
            eName: `Event ${month}`,
            eStartDate: new Date(Date.UTC(2024, month, 15, 12)).toISOString(),
        }));

        const order = groupByMonth(raw).map((m) => m.month);

        expect(order).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    });

    it("keeps the human-readable month name", () => {
        const months = groupByMonth([{ eId: "a", eName: "A", eStartDate: "2024-04-21T14:00:00.000Z" }]);

        expect(months[0].name).toBe("April");
    });
});

describe("zonedParts", () => {
    it("reads a Pacific wall clock, not the instant UTC", () => {
        // 00:30 UTC is 5:30pm the previous day in Pacific.
        const parts = zonedParts(new Date("2024-04-21T00:30:00.000Z"));

        expect(parts).toEqual({
            year: 2024,
            month: 3,
            day: 20,
            hour: 17,
            minute: 30,
            second: 0,
        });
    });

    it("follows Pacific Daylight Time", () => {
        const parts = zonedParts(new Date("2024-04-21T00:30:00.000Z"));

        expect(parts.hour).toBe(17);
    });

    it("follows Pacific Standard Time across the DST boundary", () => {
        // 2024 DST began Mar 10, so Mar 1 is still PST (UTC-8).
        const parts = zonedParts(new Date("2024-03-01T00:00:00.000Z"));

        expect(parts.month).toBe(1);
        expect(parts.day).toBe(29);
        expect(parts.hour).toBe(16);
    });

    it("honours a different zone when asked", () => {
        const parts = zonedParts(new Date("2024-04-21T00:30:00.000Z"), "UTC");

        expect(parts.day).toBe(21);
        expect(parts.hour).toBe(0);
    });
});

describe("timezone-consistent placement", () => {
    it("puts an event on the same day its label will claim", () => {
        const event = normalizeEvent({
            eId: "abc",
            eName: "Game Night",
            eStartDate: "2024-04-21T00:30:00.000Z",
        });

        // Previously the grid used the UTC day (21) while the label said Apr 20.
        expect(event.day).toBe(20);
        expect(formatEventDateTime(event)).toContain("April 20");
    });

    it("lands a leap-day instant in February", () => {
        const event = normalizeEvent({
            eId: "abc",
            eName: "Panel",
            eStartDate: "2024-03-01T00:00:00.000Z",
        });

        expect(event.month).toBe(1);
        expect(event.day).toBe(29);
    });

    it("surfaces richer fields from the source shape", () => {
        const event = normalizeEvent({
            eId: "abc",
            eName: "Panel",
            eStartDate: "2025-06-01T00:30:00Z",
            participants: 2,
            showParticipants: true,
            rsvpEnabled: true,
            rsvpQuestions: [{ qId: "q1", qString: "Dietary restrictions?" }],
        });

        expect(event.participants).toBe(2);
        expect(event.showParticipants).toBe(true);
        expect(event.rsvpEnabled).toBe(true);
        expect(event.rsvpQuestions).toHaveLength(1);
    });
});

describe("event labels", () => {
    it("lists the three categories the app shows, in legend order", () => {
        expect(EVENT_LABELS).toEqual(["Academic", "Social", "Professional"]);
    });

    it("shows a Career event as Professional, in the Professional colour", () => {
        const event = normalizeEvent({
            eId: "c",
            eName: "Resume Clinic",
            eStartDate: "2026-10-20T17:00:00Z",
            eLabels: ["Career"],
        });

        expect(event.labels).toEqual(["Professional"]);
        expect(colorForLabels(event.labels)).toBe(colorForLabels(["Professional"]));
    });

    it("lists an event tagged both Career and Professional once", () => {
        const event = normalizeEvent({
            eId: "c",
            eName: "Industry Night",
            eStartDate: "2026-10-20T17:00:00Z",
            eLabels: ["Career", "Professional", "Social"],
        });

        expect(event.labels).toEqual(["Professional", "Social"]);
    });
});

describe("colorForLabels", () => {
    it("gives each label its own colour", () => {
        const colors = EVENT_LABELS.map((label) => colorForLabels([label]));
        expect(new Set(colors).size).toBe(EVENT_LABELS.length);
    });

    it("colours a multi-label event by its first listed label", () => {
        expect(colorForLabels(["Social", "Academic"])).toBe(colorForLabels(["Social"]));
        expect(colorForLabels(["Academic", "Career"])).toBe(colorForLabels(["Academic"]));
        expect(colorForLabels(["Social", "Academic", "Career"])).toBe(colorForLabels(["Social"]));
    });

    it("names the label's colour for the palette on screen, which the calendar's stylesheet sets", () => {
        expect(colorForLabels(["Academic"])).toBe("var(--calendar-label-academic)");
        expect(colorForLabels(["Social"])).toBe("var(--calendar-label-social)");
        expect(colorForLabels(["Professional"])).toBe("var(--calendar-label-professional)");
    });

    it("only ever produces a colour the legend names", () => {
        const legend = new Set(EVENT_LABELS.map((label) => colorForLabels([label])));
        for (const labels of [[], undefined, ["Unknown"], ["Career", "Social"], ["Professional", "Academic"]]) {
            expect(legend.has(colorForLabels(labels))).toBe(true);
        }
    });
});
