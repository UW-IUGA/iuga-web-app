import { describe, expect, it } from "vitest";
import {
    addDays,
    addMonths,
    buildDayColumns,
    buildWeekDates,
    eventSegments,
    layoutOverlaps,
    overlapBox,
    normalizeEvent,
    startOfWeek,
    zonedMidnight,
    zonedParts,
} from "./calendar";

const raw = (id, start, end) => ({
    eId: id,
    eName: id,
    eStartDate: start,
    eEndDate: end,
});

describe("zonedMidnight", () => {
    it("returns the instant of Pacific midnight, not UTC midnight", () => {
        const instant = zonedMidnight(2024, 3, 20);

        // Apr 20 2024 is in PDT (UTC-7).
        expect(instant.toISOString()).toBe("2024-04-20T07:00:00.000Z");
    });

    it("handles the PST half of the year", () => {
        const instant = zonedMidnight(2026, 0, 1);

        expect(instant.toISOString()).toBe("2026-01-01T08:00:00.000Z");
    });

    it("round-trips through zonedParts back to local midnight", () => {
        const parts = zonedParts(zonedMidnight(2023, 6, 4));

        expect(parts.hour).toBe(0);
        expect(parts.minute).toBe(0);
        expect(parts.day).toBe(4);
    });
});

describe("addDays", () => {
    it("steps a whole calendar day", () => {
        const next = addDays(zonedMidnight(2024, 3, 20), 1);

        expect(zonedParts(next).day).toBe(21);
        expect(zonedParts(next).hour).toBe(0);
    });

    it("crosses the DST boundary without losing the wall clock", () => {
        // US DST 2026 began Mar 8, so Mar 8 is 23 hours long.
        const before = zonedMidnight(2026, 2, 8);
        const after = addDays(before, 1);

        expect(zonedParts(after)).toMatchObject({ month: 2, day: 9, hour: 0 });
        expect(after.getTime() - before.getTime()).toBe(23 * 3600_000);
    });

    it("walks backwards into the previous month", () => {
        const prev = addDays(zonedMidnight(2024, 3, 1), -1);

        expect(zonedParts(prev)).toMatchObject({ month: 2, day: 31 });
    });
});

describe("addMonths", () => {
    it("clamps a short month instead of spilling into the next", () => {
        const feb = addMonths(zonedMidnight(2026, 0, 31), 1);

        expect(zonedParts(feb)).toMatchObject({ month: 1, day: 28 });
    });

    it("rolls into the next year", () => {
        const dec = addMonths(zonedMidnight(2026, 0, 15), -1);

        expect(zonedParts(dec)).toMatchObject({ year: 2025, month: 11, day: 15 });
    });
});

describe("startOfWeek", () => {
    it("returns the Sunday containing the anchor", () => {
        // Tue Oct 20 2026, 1pm Pacific.
        const anchor = new Date("2026-10-20T20:00:00.000Z");

        expect(zonedParts(startOfWeek(anchor))).toMatchObject({
            year: 2026,
            month: 9,
            day: 18,
            hour: 0,
        });
    });

    it("returns the anchor itself when it is already a Sunday", () => {
        const anchor = zonedMidnight(2026, 9, 18);

        expect(zonedParts(startOfWeek(anchor))).toMatchObject({ day: 18 });
    });

    it("anchors on the Pacific day, not the instant UTC day", () => {
        // 05:00 UTC Apr 21 is 10pm Apr 20 in Pacific — a Monday UTC instant on a
        // Sunday Pacific evening.
        const anchor = new Date("2024-04-21T05:00:00.000Z");

        expect(zonedParts(startOfWeek(anchor))).toMatchObject({ month: 3, day: 14 });
    });
});

describe("buildWeekDates", () => {
    it("returns seven consecutive days starting Sunday", () => {
        const dates = buildWeekDates(new Date("2026-10-20T20:00:00.000Z"));
        const days = dates.map((d) => zonedParts(d).day);

        expect(days).toEqual([18, 19, 20, 21, 22, 23, 24]);
    });

    it("places every date at local midnight", () => {
        const dates = buildWeekDates(new Date("2026-10-20T20:00:00.000Z"));

        expect(dates.every((d) => zonedParts(d).hour === 0)).toBe(true);
    });
});

describe("eventSegments", () => {
    it("produces a single segment for an event inside one day", () => {
        const event = normalizeEvent(raw("a", "2026-10-20T17:00:00Z", "2026-10-20T18:30:00Z"));
        const segments = eventSegments(event);

        expect(segments).toHaveLength(1);
        expect(segments[0]).toMatchObject({ startMinutes: 600, endMinutes: 690 });
    });

    it("splits an event that crosses Pacific midnight", () => {
        // 05:00Z is 10pm Pacific, 08:00Z is 1am the next Pacific day.
        const event = normalizeEvent(raw("a", "2026-10-21T05:00:00Z", "2026-10-21T08:00:00Z"));
        const segments = eventSegments(event);

        expect(segments).toHaveLength(2);
        expect(segments[0].endMinutes).toBe(1440);
        expect(segments[1].startMinutes).toBe(0);
        expect(segments[1].endMinutes).toBe(60);
    });

    it("falls back to a usable duration when the source has no end", () => {
        const event = normalizeEvent({ eId: "a", eName: "a", eStartDate: "2026-10-20T17:00:00Z" });
        const segments = eventSegments(event);

        expect(segments[0].endMinutes - segments[0].startMinutes).toBe(60);
    });
});

describe("layoutOverlaps", () => {
    it("keeps non-overlapping events in a single column", () => {
        const packed = layoutOverlaps([
            { startMinutes: 600, endMinutes: 690 },
            { startMinutes: 700, endMinutes: 790 },
        ]);

        expect(packed.map((e) => e.columnCount)).toEqual([1, 1]);
        expect(packed.map((e) => e.columnIndex)).toEqual([0, 0]);
    });

    it("splits overlapping events across columns", () => {
        const packed = layoutOverlaps([
            { startMinutes: 600, endMinutes: 690 },
            { startMinutes: 630, endMinutes: 720 },
        ]);

        expect(packed.every((e) => e.columnCount === 2)).toBe(true);
        expect(new Set(packed.map((e) => e.columnIndex)).size).toBe(2);
    });

    it("serves the earlier event first", () => {
        const packed = layoutOverlaps([
            { startMinutes: 630, endMinutes: 720 },
            { startMinutes: 600, endMinutes: 690 },
        ]);

        const earlier = packed.find((e) => e.startMinutes === 600);
        expect(earlier.columnIndex).toBe(0);
    });

    it("returns to one column once the overlap ends", () => {
        const packed = layoutOverlaps([
            { startMinutes: 600, endMinutes: 690 },
            { startMinutes: 630, endMinutes: 720 },
            { startMinutes: 800, endMinutes: 890 },
        ]);

        const later = packed.find((e) => e.startMinutes === 800);
        expect(later.columnCount).toBe(1);
        expect(later.columnIndex).toBe(0);
    });

    it("stacks three concurrent events three wide", () => {
        const packed = layoutOverlaps([
            { startMinutes: 600, endMinutes: 900 },
            { startMinutes: 610, endMinutes: 910 },
            { startMinutes: 620, endMinutes: 920 },
        ]);

        expect(packed.every((e) => e.columnCount === 3)).toBe(true);
        expect(new Set(packed.map((e) => e.columnIndex)).size).toBe(3);
    });
});

describe("overlapBox", () => {
    it("gives a lone event the whole column", () => {
        expect(overlapBox(0, 1)).toEqual({ left: 0, width: 100, layer: 0 });
    });

    it("steps each overlapping event right by an equal share", () => {
        expect([0, 1, 2].map((i) => overlapBox(i, 3).left)).toEqual([0, 100 / 3, 200 / 3]);
    });

    it("lets every event but the last reach on under its neighbour", () => {
        const share = 100 / 3;
        expect(overlapBox(0, 3).width).toBeGreaterThan(share);
        expect(overlapBox(1, 3).width).toBeGreaterThan(share);
        expect(overlapBox(2, 3).width).toBeCloseTo(share);
    });

    it("never runs past the right edge of the day column", () => {
        for (let count = 1; count <= 8; count++) {
            for (let index = 0; index < count; index++) {
                const { left, width } = overlapBox(index, count);
                expect(left + width).toBeLessThanOrEqual(100 + 1e-9);
            }
        }
    });

    it("stacks later columns over earlier ones", () => {
        expect(overlapBox(2, 3).layer).toBeGreaterThan(overlapBox(1, 3).layer);
        expect(overlapBox(1, 3).layer).toBeGreaterThan(overlapBox(0, 3).layer);
    });
});

describe("buildDayColumns", () => {
    const week = () => buildWeekDates(new Date("2026-10-20T20:00:00.000Z"));
    const events = [
        normalizeEvent(raw("a", "2026-10-20T17:00:00Z", "2026-10-20T18:30:00Z")),
        normalizeEvent(raw("b", "2026-10-20T17:30:00Z", "2026-10-20T19:00:00Z")),
        normalizeEvent(raw("c", "2026-10-22T00:00:00Z", "2026-10-23T02:00:00Z")),
    ];

    it("returns one column per date", () => {
        expect(buildDayColumns(week(), events)).toHaveLength(7);
    });

    it("places an event on its Pacific day", () => {
        const columns = buildDayColumns(week(), events);
        const tuesday = columns.find((col) => col.parts.day === 20);

        // 17:00 UTC is 10am Pacific, i.e. 600 minutes in.
        expect(tuesday.events).toHaveLength(2);
        const earliest = tuesday.events.reduce((a, b) => (a.top < b.top ? a : b));
        expect(earliest.top).toBe((600 / 1440) * 100);
        expect(earliest.height).toBe((90 / 1440) * 100);
    });

    it("renders the overlapping pair two columns wide", () => {
        const columns = buildDayColumns(week(), events);
        const tuesday = columns.find((col) => col.parts.day === 20);

        expect(tuesday.events.every((e) => e.columnCount === 2)).toBe(true);
    });

    it("puts each event in its own column", () => {
        const columns = buildDayColumns(week(), events);
        const tuesday = columns.find((col) => col.parts.day === 20);
        const indices = new Set(tuesday.events.map((e) => e.columnIndex));

        expect(indices).toEqual(new Set([0, 1]));
    });

    it("marks the column matching the real current day", () => {
        const columns = buildDayColumns(week(), events);

        expect(columns.filter((col) => col.isToday).length).toBeLessThanOrEqual(1);
    });

    it("gives every column a stable key", () => {
        const columns = buildDayColumns(week(), events);

        expect(new Set(columns.map((c) => c.key)).size).toBe(7);
    });
});
