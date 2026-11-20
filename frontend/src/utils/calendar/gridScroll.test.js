import { describe, expect, it } from "vitest";
import { firstEvent, scrollTopFor } from "./gridScroll";

const item = (startMinutes, endMinutes) => ({ startMinutes, endMinutes });

describe("firstEvent", () => {
    it("finds nothing in empty columns", () => {
        expect(firstEvent([{ events: [] }, { events: [] }])).toBeNull();
    });

    it("takes the earliest start in the day, whichever column it is in", () => {
        const early = item(9 * 60, 10 * 60);
        const columns = [
            { events: [item(14 * 60, 15 * 60)] },
            { events: [item(11 * 60, 12 * 60), early] },
            { events: [] },
        ];

        expect(firstEvent(columns)).toBe(early);
    });
});

describe("scrollTopFor", () => {
    it("puts the start of the event at the top, a little below the headers", () => {
        // 10:30am at 48px an hour is 504px down the day, less the 8px lead.
        expect(scrollTopFor(item(630, 690), 48)).toBe(504 - 8);
    });

    it("never scrolls above the top of the day", () => {
        expect(scrollTopFor(item(0, 60), 48)).toBe(0);
    });
});
