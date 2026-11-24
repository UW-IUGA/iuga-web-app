import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useEntranceColumns from "./useEntranceColumns";

const SHOP = { 0: 1, 768: 2, 1300: 3 };

afterEach(() => {
    cleanup();
});

describe("useEntranceColumns", () => {
    it("follows the window width and updates on resize", () => {
        window.innerWidth = 390;
        const { result } = renderHook(() => useEntranceColumns(SHOP));
        expect(result.current).toBe(1);

        act(() => {
            window.innerWidth = 1440;
            window.dispatchEvent(new Event("resize"));
        });
        expect(result.current).toBe(3);
    });
});
