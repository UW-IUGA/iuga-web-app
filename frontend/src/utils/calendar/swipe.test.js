import { describe, expect, it } from "vitest";
import { lockAxis, startsAtEdge, SWIPE_EDGE, SWIPE_LOCK, SWIPE_MIN, swipeStep } from "./swipe";

describe("lockAxis", () => {
    it("waits while the touch could still be a tap", () => {
        expect(lockAxis(SWIPE_LOCK - 1, 0)).toBeNull();
        expect(lockAxis(0, -(SWIPE_LOCK - 1))).toBeNull();
    });

    it("reads a mostly sideways move as a swipe", () => {
        expect(lockAxis(-30, 12)).toBe("x");
        expect(lockAxis(30, -12)).toBe("x");
    });

    it("leaves a mostly downward move to the scroll", () => {
        expect(lockAxis(12, 30)).toBe("y");
        // A dead diagonal is not clearly across, so it is not a swipe.
        expect(lockAxis(20, 20)).toBe("y");
    });

    it("leaves a diagonal that leans toward 45 degrees to the scroll", () => {
        // A scroll can drift like this. Only a move clearly across is a swipe.
        expect(lockAxis(-30, -25)).toBe("y");
        expect(lockAxis(-30, 20)).toBe("y");
    });
});

describe("swipeStep", () => {
    it("steps forward for a swipe to the left, back for one to the right", () => {
        expect(swipeStep(-SWIPE_MIN)).toBe(1);
        expect(swipeStep(SWIPE_MIN)).toBe(-1);
    });

    it("springs back from a swipe too short to count", () => {
        expect(swipeStep(-(SWIPE_MIN - 1))).toBe(0);
        expect(swipeStep(SWIPE_MIN - 1)).toBe(0);
    });

    it("does not step for a touch that is not clearly across by its end", () => {
        // It started across, but it ran a long way down the page as well.
        expect(swipeStep(-120, 100)).toBe(0);
    });

    it("still steps for a swipe that is across by a clear margin", () => {
        expect(swipeStep(-120, 40)).toBe(1);
    });
});

describe("startsAtEdge", () => {
    it("leaves the screen's edges to the browser's own back swipe", () => {
        expect(startsAtEdge(SWIPE_EDGE - 1, 375)).toBe(true);
        expect(startsAtEdge(375 - SWIPE_EDGE + 1, 375)).toBe(true);
        expect(startsAtEdge(187, 375)).toBe(false);
    });
});
