import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { ENTRANCE_WAVE_MS, resetPageEntranceForTests } from "../utils/pageEntrance";
import usePageEntrance, { useChromeEntrance } from "./usePageEntrance";

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    resetPageEntranceForTests();
});

describe("usePageEntrance", () => {
    it("is on for the first visit and turns off after the wave", () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => usePageEntrance({ onceKey: "shop" }));
        expect(result.current).toBe(true);

        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS - 1);
        });
        expect(result.current).toBe(true);

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current).toBe(false);
    });

    it("does not replay after the wave when the same page remounts, and waits for ready", () => {
        vi.useFakeTimers();
        const first = renderHook(() => usePageEntrance({ onceKey: "shop" }));
        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS);
        });
        expect(first.result.current).toBe(false);
        first.unmount();

        const again = renderHook(() => usePageEntrance({ onceKey: "shop" }));
        expect(again.result.current).toBe(false);
        again.unmount();

        const preview = renderHook(() => usePageEntrance({ onceKey: "student-voice" }));
        expect(preview.result.current).toBe(true);
        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS);
        });
        preview.unmount();

        const afterSignIn = renderHook(() => usePageEntrance({ onceKey: "student-voice" }));
        expect(afterSignIn.result.current).toBe(false);
    });

    it("starts the wave on the first ready render, not on a placeholder render", () => {
        vi.useFakeTimers();
        let ready = false;
        const hook = renderHook(() => usePageEntrance({ onceKey: "checkout", ready }));
        expect(hook.result.current).toBe(false);

        ready = true;
        hook.rerender();
        expect(hook.result.current).toBe(true);

        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS);
        });
        expect(hook.result.current).toBe(false);
    });
});

describe("useChromeEntrance", () => {
    it("plays on the first mount only, even if the bar remounts", () => {
        vi.useFakeTimers();
        const first = renderHook(() => useChromeEntrance());
        expect(first.result.current).toBe(true);
        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS);
        });
        first.unmount();

        const remount = renderHook(() => useChromeEntrance());
        expect(remount.result.current).toBe(false);
    });
});
