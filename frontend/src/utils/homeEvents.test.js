import { calendarWeekHref, dayLabel, pickHomeEvents, seeAllLabel } from "./homeEvents";

const NOW = new Date(2026, 10, 19, 12);
const event = (eId, days, hour = 12) => ({
    eId,
    eStartDate: new Date(2026, 10, 19 + days, hour).toISOString(),
});
const ids = (picked) => picked.items.map((item) => item.eId);

describe("pickHomeEvents", () => {
    test("shows the next three upcoming events, soonest first", () => {
        const picked = pickHomeEvents([event("d", 9), event("a", 1), event("c", 5), event("b", 2)], NOW);

        expect(picked.kind).toBe("upcoming");
        expect(ids(picked)).toEqual(["a", "b", "c"]);
        expect(picked.total).toBe(4);
    });

    test("falls back to the latest past events, newest first, when nothing is upcoming", () => {
        const picked = pickHomeEvents([event("old", -30), event("recent", -1), event("mid", -7)], NOW);

        expect(picked.kind).toBe("latest");
        expect(ids(picked)).toEqual(["recent", "mid", "old"]);
    });

    test("leaves out events whose start date cannot be read", () => {
        const picked = pickHomeEvents([{ eId: "broken", eStartDate: "not a date" }, event("a", 1)], NOW);

        expect(ids(picked)).toEqual(["a"]);
        expect(picked.total).toBe(1);
    });

    test("returns no events for an empty list", () => {
        expect(pickHomeEvents([], NOW)).toEqual({ kind: "latest", items: [], total: 0 });
    });
});

describe("dayLabel", () => {
    const start = (days, hour = 12) => new Date(2026, 10, 19 + days, hour);

    test("names nearby days in words", () => {
        expect(dayLabel(start(0, 23), NOW)).toBe("Today");
        expect(dayLabel(start(1, 1), NOW)).toBe("Tomorrow");
        expect(dayLabel(start(-1), NOW)).toBe("Yesterday");
        expect(dayLabel(start(3), NOW)).toBe("In 3 days");
        expect(dayLabel(start(-4), NOW)).toBe("4 days ago");
    });

    test("shows the date itself a week or more away", () => {
        expect(dayLabel(start(7), NOW)).toBe("Thu, Nov 26");
        expect(dayLabel(start(-7), NOW)).toBe("Thu, Nov 12");
    });
});

describe("seeAllLabel", () => {
    test("counts the upcoming events when the calendar holds more than are shown", () => {
        expect(seeAllLabel({ kind: "upcoming", total: 8 })).toBe("See all 8 upcoming events");
        expect(seeAllLabel({ kind: "upcoming", total: 3 })).toBe("See all events");
    });

    test("points to past events when only past events are shown", () => {
        expect(seeAllLabel({ kind: "latest", total: 12 })).toBe("Browse past events");
    });
});

describe("calendarWeekHref", () => {
    test("opens the calendar's week view on the event's day", () => {
        expect(calendarWeekHref(new Date(2026, 0, 5, 18))).toBe("/events?view=week&date=2026-01-05");
    });
});
