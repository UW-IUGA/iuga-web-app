import { describe, expect, it } from "vitest";
import { formatRange } from "./calendar";

// Tue Oct 20 2026, 1pm Pacific.
const anchor = new Date("2026-10-20T20:00:00.000Z");

describe("formatRange", () => {
    it("labels the year view as the whole archive, not a year", () => {
        expect(formatRange("year", anchor)).toBe("All Events");
    });

    it("labels the year view the same whatever the anchor is", () => {
        // Year view is not anchored — it holds every event the calendar has.
        expect(formatRange("year", new Date("2020-01-01T20:00:00.000Z"))).toBe("All Events");
        expect(formatRange("year", new Date("2031-12-31T20:00:00.000Z"))).toBe("All Events");
    });

    it("names the whole month in month view", () => {
        expect(formatRange("month", anchor)).toBe("October 2026");
    });

    it("spans Sunday to Saturday in week view", () => {
        expect(formatRange("week", anchor)).toBe("Oct 18 – Oct 24, 2026");
    });

    it("names the single day in day view", () => {
        expect(formatRange("day", anchor)).toBe("Tue, Oct 20, 2026");
    });

    it("carries the end year when a week straddles New Year", () => {
        // Thu Dec 31 2026 — its week runs Sun Dec 27 2026 to Sat Jan 2 2027.
        const newYear = new Date("2026-12-31T20:00:00.000Z");

        expect(formatRange("week", newYear)).toBe("Dec 27 – Jan 2, 2027");
    });

    it("falls back to the month for an unknown mode", () => {
        expect(formatRange("fortnight", anchor)).toBe("October 2026");
    });
});
