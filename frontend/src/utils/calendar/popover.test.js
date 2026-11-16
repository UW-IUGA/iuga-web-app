import { describe, expect, it } from "vitest";
import { placePopover, placeStacked } from "./popover";

const viewport = { width: 1400, height: 900 };
const popover = { width: 340, height: 400 };
// An event card in the middle of the window.
const anchor = { left: 600, right: 760, top: 300 };

describe("placePopover", () => {
    it("opens to the right of the event, past a small gap", () => {
        expect(placePopover(anchor, popover, "right", viewport)).toEqual({
            left: 768,
            top: 300,
        });
    });

    it("opens to the left of the event, its right edge a gap short of it", () => {
        expect(placePopover(anchor, popover, "left", viewport)).toEqual({
            left: 252,
            top: 300,
        });
    });

    it("slides back inside the window rather than running off an edge", () => {
        const nearLeft = { left: 120, right: 280, top: 300 };
        const nearRight = { left: 1200, right: 1360, top: 300 };

        expect(placePopover(nearLeft, popover, "left", viewport).left).toBe(16);
        expect(placePopover(nearRight, popover, "right", viewport).left).toBe(1400 - 16 - 340);
    });

    it("lifts a popover that would fall off the bottom", () => {
        const low = { left: 600, right: 760, top: 800 };

        expect(placePopover(low, popover, "right", viewport).top).toBe(900 - 16 - 400);
    });

    it("never goes above the top of the window", () => {
        const high = { left: 600, right: 760, top: -50 };

        expect(placePopover(high, popover, "right", viewport).top).toBe(16);
    });
});

describe("placeStacked", () => {
    // A phone, and a popover as wide as the phone allows.
    const phone = { width: 375, height: 667 };
    const phonePopover = { width: 343, height: 400 };
    // A 48px event block whose top edge is at `top`.
    const eventAt = (top) => ({ left: 42, right: 374, top, bottom: top + 48 });

    it("goes below the event when the whole popover fits there", () => {
        expect(placeStacked(eventAt(100), phonePopover, phone)).toEqual({
            left: 16,
            top: 156,
        });
    });

    it("goes above the event when only the space above fits it", () => {
        // Low on the screen: 400px does not fit below, but it does fit above.
        expect(placeStacked(eventAt(612), phonePopover, phone)).toEqual({
            left: 16,
            top: 612 - 8 - 400,
        });
    });

    it("takes the side with more room when neither fits, and cuts it to that room", () => {
        // Below has 667 - 348 - 8 - 16 = 295px, above has 300 - 8 - 16 = 276px.
        expect(placeStacked(eventAt(300), phonePopover, phone)).toEqual({
            left: 16,
            top: 356,
            maxHeight: 295,
        });
    });

    it("stays below a sticky header, cut to the room under it", () => {
        // A 64px site header. Above has 300 - 8 - (64 + 8) = 220px, below 295px.
        expect(placeStacked(eventAt(300), phonePopover, phone, 64)).toEqual({
            left: 16,
            top: 356,
            maxHeight: 295,
        });
        // Low on the screen, going above: it starts under the header, never on it.
        const placed = placeStacked(eventAt(560), { width: 343, height: 600 }, phone, 64);
        expect(placed.top).toBe(64 + 8);
        expect(placed.maxHeight).toBe(560 - 8 - 72);
    });

    it("never covers the event it belongs to", () => {
        for (const top of [0, 100, 250, 300, 400, 612]) {
            const event = eventAt(top);
            const placed = placeStacked(event, phonePopover, phone);
            const height = placed.maxHeight ?? phonePopover.height;

            const endsAbove = placed.top + height <= event.top;
            const startsBelow = placed.top >= event.bottom;
            expect(endsAbove || startsBelow).toBe(true);
        }
    });

    it("keeps the popover inside the window", () => {
        for (const top of [0, 100, 250, 300, 400, 612]) {
            const placed = placeStacked(eventAt(top), phonePopover, phone);
            const height = placed.maxHeight ?? phonePopover.height;

            expect(placed.top).toBeGreaterThanOrEqual(16);
            expect(placed.top + height).toBeLessThanOrEqual(667 - 16);
        }
    });
});
