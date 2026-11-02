import { describe, expect, it } from "vitest";
import { placePopover } from "./popover";

const viewport = { width: 1400, height: 900 };
const popover = { width: 340, height: 400 };
// An event card in the middle of the window.
const anchor = { left: 600, right: 760, top: 300 };

describe("placePopover", () => {
    it("opens to the right of the event, past a small gap", () => {
        expect(placePopover(anchor, popover, "right", viewport)).toEqual({ left: 768, top: 300 });
    });

    it("opens to the left of the event, its right edge a gap short of it", () => {
        expect(placePopover(anchor, popover, "left", viewport)).toEqual({ left: 252, top: 300 });
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
