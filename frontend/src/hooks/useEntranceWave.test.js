import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useEntranceWave, { ENTRANCE_WAVE_MS } from "./useEntranceWave";

const contentKey = (mode, dateKey, tagsKey = "Academic,Career,Social") =>
    `${mode}|${dateKey}|${tagsKey}`;

const MONTH = contentKey("month", "2026-10-20");

const keys = (...ids) => ids.map((id) => `event:${id}`);

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("useEntranceWave", () => {
    it("marks only events that just became visible when a tag is turned on, on that render", () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ visibleIds, active, contentKey: key }) => useEntranceWave(visibleIds, { active, contentKey: key }),
            { initialProps: { visibleIds: keys("academic-1", "career-1"), active: false, contentKey: MONTH } },
        );

        rerender({ visibleIds: keys("academic-1", "career-1"), active: true, contentKey: MONTH });
        expect(result.current.isEvent("career-1")).toBe(false);

        rerender({
            visibleIds: keys("academic-1"),
            active: true,
            contentKey: contentKey("month", "2026-10-20", "Academic,Social"),
        });
        expect(result.current.isEvent("academic-1")).toBe(false);
        expect(result.current.isEvent("career-1")).toBe(false);

        rerender({ visibleIds: keys("academic-1", "career-1"), active: true, contentKey: MONTH });
        expect(result.current.isEvent("career-1")).toBe(true);
        expect(result.current.isEvent("academic-1")).toBe(false);

        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS - 1);
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
            ({ visibleIds, active, contentKey: key }) => useEntranceWave(visibleIds, { active, contentKey: key }),
            { initialProps: { visibleIds: keys("october"), active: true, contentKey: MONTH } },
        );

        rerender({
            visibleIds: keys("november"),
            active: true,
            contentKey: contentKey("month", "2026-11-05"),
        });
        expect(result.current.isEvent("november")).toBe(true);
        expect(result.current.isEvent("october")).toBe(false);

        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS);
        });
        expect(result.current.isEvent("november")).toBe(false);
    });

    it("marks every newly shown event at once when the whole period is new", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, contentKey: key }) => useEntranceWave(visibleIds, { active, contentKey: key }),
            { initialProps: { visibleIds: keys("october-1", "october-2"), active: true, contentKey: MONTH } },
        );

        rerender({
            visibleIds: keys("november-1", "november-2"),
            active: true,
            contentKey: contentKey("month", "2026-11-05"),
        });
        expect(result.current.isEvent("november-1")).toBe(true);
        expect(result.current.isEvent("november-2")).toBe(true);
    });

    it("does not mark events that stay visible across a date change", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, contentKey: key }) => useEntranceWave(visibleIds, { active, contentKey: key }),
            {
                initialProps: {
                    visibleIds: keys("overlap", "october"),
                    active: true,
                    contentKey: contentKey("month", "2026-09-15"),
                },
            },
        );

        rerender({ visibleIds: keys("overlap", "late-october"), active: true, contentKey: MONTH });
        expect(result.current.isEvent("late-october")).toBe(true);
        expect(result.current.isEvent("overlap")).toBe(false);
    });

    it("marks every visible event when the view changes, including ones that were already on screen", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, contentKey: key }) => useEntranceWave(visibleIds, { active, contentKey: key }),
            { initialProps: { visibleIds: keys("academic-1"), active: true, contentKey: MONTH } },
        );

        rerender({
            visibleIds: keys("academic-1", "career-1"),
            active: true,
            contentKey: contentKey("week", "2026-10-20"),
        });
        expect(result.current.isEvent("academic-1")).toBe(true);
        expect(result.current.isEvent("career-1")).toBe(true);
    });

    it("replaces the wave when the view or date changes again before it finishes", () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ visibleIds, active, contentKey: key }) => useEntranceWave(visibleIds, { active, contentKey: key }),
            { initialProps: { visibleIds: keys("october"), active: true, contentKey: MONTH } },
        );

        rerender({
            visibleIds: keys("november"),
            active: true,
            contentKey: contentKey("month", "2026-11-15"),
        });
        expect(result.current.isEvent("november")).toBe(true);

        rerender({
            visibleIds: keys("week-1"),
            active: true,
            contentKey: contentKey("week", "2026-11-15"),
        });
        expect(result.current.isEvent("week-1")).toBe(true);
        expect(result.current.isEvent("november")).toBe(false);

        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS);
        });
        expect(result.current.isEvent("week-1")).toBe(false);
    });

    it("does not mark events while the first-visit wave is still playing", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, contentKey: key }) => useEntranceWave(visibleIds, { active, contentKey: key }),
            {
                initialProps: {
                    visibleIds: keys("academic-1"),
                    active: false,
                    contentKey: contentKey("month", "2026-10-20", "Academic,Social"),
                },
            },
        );

        rerender({ visibleIds: keys("academic-1", "career-1"), active: false, contentKey: MONTH });
        expect(result.current.isEvent("career-1")).toBe(false);

        rerender({ visibleIds: keys("academic-1", "career-1"), active: true, contentKey: MONTH });
        expect(result.current.isEvent("career-1")).toBe(false);

        rerender({
            visibleIds: keys("november"),
            active: false,
            contentKey: contentKey("month", "2026-11-05"),
        });
        expect(result.current.isEvent("november")).toBe(false);
    });

    it("does not mark events when the list changes but the view, date, and filter do not", () => {
        const { result, rerender } = renderHook(
            ({ visibleIds, active, contentKey: key }) => useEntranceWave(visibleIds, { active, contentKey: key }),
            { initialProps: { visibleIds: keys("academic-1"), active: true, contentKey: MONTH } },
        );

        rerender({ visibleIds: keys("academic-1", "social-1"), active: true, contentKey: MONTH });
        expect(result.current.isEvent("social-1")).toBe(false);
        expect(result.current.isEvent("academic-1")).toBe(false);
    });
});
