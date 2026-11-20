import { describe, expect, it } from "vitest";
import { chooseSide, followAnchor, placePopover, placeStacked } from "./popover";

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

    it("centres over the event, level with its top, for the day view", () => {
        // The event's middle is at 680, so the 340px popover starts 170px before it.
        expect(placePopover(anchor, popover, "center", viewport)).toEqual({
            left: 510,
            top: 300,
        });
    });

    it("lands a day-wide event's popover mid-grid, not against the window's right edge", () => {
        const dayWide = { left: 300, right: 1300, top: 300 };

        expect(placePopover(dayWide, popover, "center", viewport).left).toBe(800 - 170);
    });

    it("keeps a centred popover inside the window", () => {
        const nearLeft = { left: 20, right: 100, top: 300 };

        expect(placePopover(nearLeft, popover, "center", viewport).left).toBe(16);
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

describe("placePopover inside the calendar", () => {
    // The calendar runs from 100 to 800 down the window, with Previous events below.
    const calendar = { left: 40, right: 1360, top: 100, bottom: 800 };

    it("places as usual while the popover fits inside the calendar", () => {
        expect(placePopover(anchor, popover, "right", viewport, 0, calendar)).toEqual({ left: 768, top: 300 });
    });

    it("lifts the popover so it ends at the line above Previous events", () => {
        const low = { left: 600, right: 760, top: 600 };

        expect(placePopover(low, popover, "right", viewport, 0, calendar).top).toBe(800 - 400);
    });

    it("leaves with the calendar as the page scrolls on, rather than staying on screen", () => {
        // Scrolled so the calendar's bottom edge is 200px down the window, and its
        // event gone off the top.
        const scrolled = { left: 40, right: 1360, top: -500, bottom: 200 };
        const gone = { left: 600, right: 760, top: -100 };

        const { top } = placePopover(gone, popover, "right", viewport, 0, scrolled);
        expect(top + popover.height).toBeLessThanOrEqual(200);
    });

    it("cuts a popover taller than the calendar to the calendar's height", () => {
        const short = { left: 40, right: 1360, top: 100, bottom: 400 };

        expect(placePopover(anchor, popover, "right", viewport, 0, short)).toEqual({
            left: 768,
            top: 100,
            maxHeight: 300,
        });
    });

    it("keeps the popover within the calendar's sides as well as the window's", () => {
        const narrow = { left: 200, right: 1000, top: 100, bottom: 800 };
        const nearRight = { left: 800, right: 960, top: 300 };

        expect(placePopover(nearRight, popover, "right", viewport, 0, narrow).left).toBe(1000 - 340);
    });
});

describe("placePopover under the site navigation", () => {
    // The sticky navigation ends 64px down the window.
    const navBottom = 64;

    it("starts below the navigation, never over it", () => {
        const underNav = { left: 600, right: 760, top: 40 };

        expect(placePopover(underNav, popover, "right", viewport, navBottom).top).toBe(64 + 8);
    });

    it("cuts a popover taller than the room under the navigation to that room", () => {
        expect(placePopover(anchor, { width: 340, height: 900 }, "right", viewport, navBottom)).toEqual({
            left: 768,
            top: 72,
            maxHeight: 900 - 16 - 72,
        });
    });

    it("goes up under the navigation with the calendar as the page scrolls on, rather than staying over it", () => {
        // The calendar's bottom edge is 200px down, so the popover must end there,
        // which takes its top above the navigation, where the navigation covers it.
        const scrolled = { left: 40, right: 1360, top: -500, bottom: 200 };

        expect(placePopover(anchor, popover, "right", viewport, navBottom, scrolled).top).toBe(200 - 400);
    });
});

describe("chooseSide", () => {
    const sameSpot = { left: 600, right: 760, top: 300 };

    it("keeps the preferred side when the whole popover fits there", () => {
        expect(chooseSide(sameSpot, popover, "right", viewport)).toBe("right");
        expect(chooseSide(sameSpot, popover, "left", viewport)).toBe("left");
    });

    it("flips to the left when there is no room on the right", () => {
        const nearRight = { left: 1000, right: 1160, top: 300 };

        expect(chooseSide(nearRight, popover, "right", viewport)).toBe("left");
    });

    it("flips to the right when there is no room on the left", () => {
        const nearLeft = { left: 120, right: 280, top: 300 };

        expect(chooseSide(nearLeft, popover, "left", viewport)).toBe("right");
    });

    it("takes the side with more room when neither side fits the whole popover", () => {
        const narrow = { width: 500, height: 900 };
        const middle = { left: 200, right: 360, top: 300 };

        expect(chooseSide(middle, popover, "right", narrow)).toBe("left");
    });

    it("never places a flipped popover over the event it belongs to", () => {
        const nearRight = { left: 1000, right: 1160, top: 300 };
        const side = chooseSide(nearRight, popover, "right", viewport);
        const { left } = placePopover(nearRight, popover, side, viewport);

        const overlapsEvent = left < nearRight.right && left + popover.width > nearRight.left;
        expect(overlapsEvent).toBe(false);
    });
});

describe("placeStacked", () => {
    // A phone, and a popover as wide as the phone allows.
    const phone = { width: 375, height: 667 };
    const phonePopover = { width: 343, height: 400 };
    // A 48px event block whose top edge is at `top`.
    const eventAt = (top) => ({ left: 42, right: 374, top, bottom: top + 48 });

    describe("inside the calendar", () => {
        // The calendar ends 500px down the phone, with Previous events below.
        const calendar = { left: 0, right: 375, top: 60, bottom: 500 };

        it("counts only the calendar's room below the event, and cuts the popover to it", () => {
            // Below there is 500 - 148 - 8 = 344px, under 400; above, 100 - 8 - 60 = 32px.
            // Neither fits, so it takes the larger room below and is cut to it.
            expect(placeStacked(eventAt(100), phonePopover, phone, 0, calendar)).toEqual({
                left: 16,
                top: 156,
                maxHeight: 344,
            });
        });

        it("never reaches past the line above Previous events", () => {
            const placed = placeStacked(eventAt(150), { width: 343, height: 200 }, phone, 0, calendar);

            expect(placed.top + (placed.maxHeight ?? 200)).toBeLessThanOrEqual(500);
        });

        it("leaves with the calendar as the page scrolls on, rather than staying on screen", () => {
            // Scrolled until the calendar ends 120px down the phone, its event gone off the top.
            const scrolled = { left: 0, right: 375, top: -600, bottom: 120 };
            const small = { width: 343, height: 200 };

            const placed = placeStacked(eventAt(-100), small, phone, 64, scrolled);
            expect(placed.top + (placed.maxHeight ?? small.height)).toBeLessThanOrEqual(120);
        });
    });

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

describe("followAnchor", () => {
    // Opened 8px under an event at 300, 400px tall, with the event's left at 42.
    const placement = { left: 16, top: 356, anchorLeft: 42, anchorTop: 300, height: 400 };
    const calendar = { left: 0, right: 375, top: 100, bottom: 1200 };

    it("moves with the event, keeping its place beside it", () => {
        expect(followAnchor(placement, { left: 42, top: 220 }, calendar)).toEqual({ left: 16, top: 276 });
    });

    it("never flips to the other side of the event, however the room changes", () => {
        // Near the bottom of the calendar there is no longer room below the event,
        // but the popover only shifts: it does not jump above.
        const nearBottom = followAnchor(placement, { left: 42, top: 760 }, calendar);
        expect(nearBottom.top).toBe(1200 - 400);
        expect(nearBottom.top).toBeGreaterThan(760 - 400);
    });

    it("stops at the calendar's edges rather than following the event out of it", () => {
        expect(followAnchor(placement, { left: 42, top: -500 }, calendar).top).toBe(100);
        expect(followAnchor(placement, { left: 42, top: 2000 }, calendar).top).toBe(1200 - 400);
    });
});
