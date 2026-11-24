import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useFilterReveal, { FILTER_REVEAL_MS } from "./useFilterReveal";

const MONTH = {
    mode: "month",
    dateKey: "2026-10-20",
    tagsKey: "Academic,Career,Social",
};

const keys = (...ids) => ids.map((id) => `event:${id}`);

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("useFilterReveal", () => {
    it("marks only events that just became visible when a tag is turned on, on that render", () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: keys("academic-1", "career-1"), active: false, ...MONTH } },
        );

        rerender({ visibleIds: keys("academic-1", "career-1"), active: true, ...MONTH });
        expect(result.current.isEvent("career-1")).toBe(false);

        rerender({
            visibleIds: keys("academic-1"),
            active: true,
            ...MONTH,
            tagsKey: "Academic,Social",
        });
        expect(result.current.isEvent("academic-1")).toBe(false);
        expect(result.current.isEvent("career-1")).toBe(false);

        rerender({ visibleIds: keys("academic-1", "career-1"), active: true, ...MONTH });
        // The class is present on this render, not after a paint, so the chip
        // cannot show for a frame and then jump.
        expect(result.current.isEvent("career-1")).toBe(true);
        expect(result.current.isEvent("academic-1")).toBe(false);

        act(() => {
            vi.advanceTimersByTime(FILTER_REVEAL_MS - 1);
        });
        expect(result.current.isEvent("career-1")).toBe(true);

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current.isEvent("career-1")).toBe(false);
    });

    it("marks only events that just became visible when the date changes", () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: keys("october"), active: true, ...MONTH } },
        );

        rerender({
            visibleIds: keys("november"),
            active: true,
            ...MONTH,
            dateKey: "2026-11-05",
        });
        expect(result.current.isEvent("november")).toBe(true);
        expect(result.current.isEvent("october")).toBe(false);

        act(() => {
            vi.advanceTimersByTime(FILTER_REVEAL_MS);
        });
        expect(result.current.isEvent("november")).toBe(false);
    });

    it("marks every newly shown event at once when the whole period is new", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: keys("october-1", "october-2"), active: true, ...MONTH } },
        );

        rerender({
            visibleIds: keys("november-1", "november-2"),
            active: true,
            ...MONTH,
            dateKey: "2026-11-05",
        });
        expect(result.current.isEvent("november-1")).toBe(true);
        expect(result.current.isEvent("november-2")).toBe(true);
    });

    it("does not mark events that stay visible across a date change", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: keys("overlap", "october"), active: true, ...MONTH, dateKey: "2026-09-15" } },
        );

        rerender({
            visibleIds: keys("overlap", "late-october"),
            active: true,
            ...MONTH,
        });
        expect(result.current.isEvent("late-october")).toBe(true);
        expect(result.current.isEvent("overlap")).toBe(false);
    });

    it("replaces the wave when the date changes again before it finishes", () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: keys("october"), active: true, ...MONTH } },
        );

        rerender({
            visibleIds: keys("november"),
            active: true,
            ...MONTH,
            dateKey: "2026-11-15",
        });
        expect(result.current.isEvent("november")).toBe(true);

        rerender({
            visibleIds: keys("december"),
            active: true,
            ...MONTH,
            dateKey: "2026-12-15",
        });
        expect(result.current.isEvent("december")).toBe(true);
        expect(result.current.isEvent("november")).toBe(false);

        act(() => {
            vi.advanceTimersByTime(FILTER_REVEAL_MS);
        });
        expect(result.current.isEvent("december")).toBe(false);
    });

    it("does not mark events while the first-visit wave is still playing", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: keys("academic-1"), active: false, ...MONTH, tagsKey: "Academic,Social" } },
        );

        rerender({ visibleIds: keys("academic-1", "career-1"), active: false, ...MONTH });
        expect(result.current.isEvent("career-1")).toBe(false);

        rerender({ visibleIds: keys("academic-1", "career-1"), active: true, ...MONTH });
        expect(result.current.isEvent("career-1")).toBe(false);

        rerender({
            visibleIds: keys("november"),
            active: false,
            ...MONTH,
            dateKey: "2026-11-05",
        });
        expect(result.current.isEvent("november")).toBe(false);
    });

    it("does not mark events when the view changes", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: keys("academic-1"), active: true, ...MONTH } },
        );

        rerender({
            visibleIds: keys("academic-1", "career-1"),
            active: true,
            ...MONTH,
            mode: "week",
        });
        expect(result.current.isEvent("career-1")).toBe(false);
        expect(result.current.isEvent("academic-1")).toBe(false);
    });

    it("does not mark events when the list changes but the date and filter do not", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: keys("academic-1"), active: true, ...MONTH } },
        );

        rerender({ visibleIds: keys("academic-1", "social-1"), active: true, ...MONTH });
        expect(result.current.isEvent("social-1")).toBe(false);
        expect(result.current.isEvent("academic-1")).toBe(false);
    });
});
