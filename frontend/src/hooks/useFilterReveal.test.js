import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useFilterReveal, { FILTER_REVEAL_MS } from "./useFilterReveal";

const MONTH = {
    mode: "month",
    dateKey: "2026-10-20",
    tagsKey: "Academic,Career,Social",
};

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("useFilterReveal", () => {
    it("marks only events that just became visible when a tag is turned on", () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: ["academic-1", "career-1"], active: false, ...MONTH } },
        );

        rerender({ visibleIds: ["academic-1", "career-1"], active: true, ...MONTH });
        expect(result.current("career-1")).toBe(false);

        rerender({
            visibleIds: ["academic-1"],
            active: true,
            ...MONTH,
            tagsKey: "Academic,Social",
        });
        expect(result.current("academic-1")).toBe(false);
        expect(result.current("career-1")).toBe(false);

        rerender({ visibleIds: ["academic-1", "career-1"], active: true, ...MONTH });
        expect(result.current("career-1")).toBe(true);
        expect(result.current("academic-1")).toBe(false);

        act(() => {
            vi.advanceTimersByTime(FILTER_REVEAL_MS - 1);
        });
        expect(result.current("career-1")).toBe(true);

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current("career-1")).toBe(false);
    });

    it("marks only events that just became visible when the date changes", () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: ["october"], active: true, ...MONTH } },
        );

        rerender({
            visibleIds: ["november"],
            active: true,
            ...MONTH,
            dateKey: "2026-11-05",
        });
        expect(result.current("november")).toBe(true);
        expect(result.current("october")).toBe(false);

        act(() => {
            vi.advanceTimersByTime(FILTER_REVEAL_MS);
        });
        expect(result.current("november")).toBe(false);
    });

    it("marks every newly shown event at once when the whole period is new", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: ["october-1", "october-2"], active: true, ...MONTH } },
        );

        rerender({
            visibleIds: ["november-1", "november-2"],
            active: true,
            ...MONTH,
            dateKey: "2026-11-05",
        });
        expect(result.current("november-1")).toBe(true);
        expect(result.current("november-2")).toBe(true);
    });

    it("does not mark events that stay visible across a date change", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: ["overlap", "october"], active: true, ...MONTH, dateKey: "2026-09-15" } },
        );

        rerender({
            visibleIds: ["overlap", "late-october"],
            active: true,
            ...MONTH,
        });
        expect(result.current("late-october")).toBe(true);
        expect(result.current("overlap")).toBe(false);
    });

    it("does not mark events while the first-visit wave is still playing", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: ["academic-1"], active: false, ...MONTH, tagsKey: "Academic,Social" } },
        );

        rerender({ visibleIds: ["academic-1", "career-1"], active: false, ...MONTH });
        expect(result.current("career-1")).toBe(false);

        rerender({ visibleIds: ["academic-1", "career-1"], active: true, ...MONTH });
        expect(result.current("career-1")).toBe(false);

        rerender({
            visibleIds: ["november"],
            active: false,
            ...MONTH,
            dateKey: "2026-11-05",
        });
        expect(result.current("november")).toBe(false);
    });

    it("does not mark events when the view changes", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: ["academic-1"], active: true, ...MONTH } },
        );

        rerender({
            visibleIds: ["academic-1", "career-1"],
            active: true,
            ...MONTH,
            mode: "week",
        });
        expect(result.current("career-1")).toBe(false);
        expect(result.current("academic-1")).toBe(false);
    });

    it("does not mark events when the list changes but the date and filter do not", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, mode, dateKey, tagsKey }) =>
                useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey }),
            { initialProps: { visibleIds: ["academic-1"], active: true, ...MONTH } },
        );

        rerender({ visibleIds: ["academic-1", "social-1"], active: true, ...MONTH });
        expect(result.current("social-1")).toBe(false);
        expect(result.current("academic-1")).toBe(false);
    });
});
