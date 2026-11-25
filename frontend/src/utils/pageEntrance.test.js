import { afterEach, describe, expect, it, vi } from "vitest";
import {
    columnsForWidth,
    entranceGridOrder,
    entranceOrder,
    entranceRow,
    overlayOrigin,
    chromeShouldEnter,
    pageShouldEnter,
    resetPageEntranceForTests,
    ENTRANCE_WAVE_MS,
} from "./pageEntrance";

afterEach(() => {
    resetPageEntranceForTests();
    vi.useRealTimers();
});

describe("entrance order helpers", () => {
    it("sets a 0-based --entrance-i, keeping any other style", () => {
        expect(entranceOrder(3, { backgroundColor: "red" })).toEqual({
            backgroundColor: "red",
            "--entrance-i": 3,
        });
    });

    it("sets --entrance-row, keeping any other style", () => {
        expect(entranceRow(2, { backgroundColor: "red" })).toEqual({
            backgroundColor: "red",
            "--entrance-row": 2,
        });
    });

    it("splits a reading-order index into a row and an in-row index", () => {
        expect(entranceGridOrder(5, 3, { color: "blue" })).toEqual({
            color: "blue",
            "--entrance-row": 1,
            "--entrance-i": 2,
        });
        expect(entranceGridOrder(0, 2)).toEqual({
            "--entrance-row": 0,
            "--entrance-i": 0,
        });
    });

    it("treats a missing or zero column count as one column", () => {
        expect(entranceGridOrder(4, 0)).toEqual({
            "--entrance-row": 4,
            "--entrance-i": 0,
        });
    });

    it("sets the overlay origin variable, keeping any other style", () => {
        expect(overlayOrigin("top right", { zIndex: 2 })).toEqual({
            zIndex: 2,
            "--overlay-origin": "top right",
        });
    });
});

describe("columnsForWidth", () => {
    const shop = { 0: 1, 768: 2, 1300: 3 };

    it("picks the count for the widest step the width has reached", () => {
        expect(columnsForWidth(shop, 390)).toBe(1);
        expect(columnsForWidth(shop, 768)).toBe(2);
        expect(columnsForWidth(shop, 1299)).toBe(2);
        expect(columnsForWidth(shop, 1300)).toBe(3);
    });
});

describe("session flags", () => {
    it("lets chrome enter once, then not again after the wave or until reset", () => {
        vi.useFakeTimers();
        expect(chromeShouldEnter()).toBe(true);
        expect(chromeShouldEnter()).toBe(true);
        vi.advanceTimersByTime(ENTRANCE_WAVE_MS);
        expect(chromeShouldEnter()).toBe(false);
        resetPageEntranceForTests();
        expect(chromeShouldEnter()).toBe(true);
        vi.useRealTimers();
    });

    it("plays a keyed page only once, and still plays during the wave if it remounts", () => {
        expect(pageShouldEnter("student-voice")).toBe(true);
        expect(pageShouldEnter("student-voice")).toBe(true);
        expect(pageShouldEnter("shop")).toBe(true);
        expect(() => pageShouldEnter()).toThrow(/onceKey/);
    });
});
