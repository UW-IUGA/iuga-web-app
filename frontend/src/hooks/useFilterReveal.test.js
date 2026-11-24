import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import useFilterReveal, { FILTER_REVEAL_MS } from "./useFilterReveal";

const ALL = ["Academic", "Career", "Social"];
const WITHOUT_CAREER = ["Academic", "Social"];
const academic = { id: "academic-1" };
const career = { id: "career-1" };

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe("useFilterReveal", () => {
    it("marks only events that just became visible when a tag is turned on", () => {
        vi.useFakeTimers();
        const { result, rerender } = renderHook(
            ({ events, shownTags, active }) => useFilterReveal(events, shownTags, { active }),
            { initialProps: { events: [academic, career], shownTags: ALL, active: false } },
        );

        rerender({ events: [academic, career], shownTags: ALL, active: true });
        expect(result.current("career-1")).toBe(false);

        rerender({ events: [academic], shownTags: WITHOUT_CAREER, active: true });
        expect(result.current("academic-1")).toBe(false);
        expect(result.current("career-1")).toBe(false);

        rerender({ events: [academic, career], shownTags: ALL, active: true });
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

    it("does not mark events while the first-visit wave is still playing", () => {
        const { result, rerender } = renderHook(
            ({ events, shownTags, active }) => useFilterReveal(events, shownTags, { active }),
            { initialProps: { events: [academic], shownTags: WITHOUT_CAREER, active: false } },
        );

        rerender({ events: [academic, career], shownTags: ALL, active: false });
        expect(result.current("career-1")).toBe(false);

        rerender({ events: [academic, career], shownTags: ALL, active: true });
        expect(result.current("career-1")).toBe(false);
    });

    it("does not mark events when the list changes but the filter does not", () => {
        const extra = { id: "social-1" };
        const { result, rerender } = renderHook(
            ({ events, shownTags, active }) => useFilterReveal(events, shownTags, { active }),
            { initialProps: { events: [academic], shownTags: ALL, active: true } },
        );

        rerender({ events: [academic, extra], shownTags: ALL, active: true });
        expect(result.current("social-1")).toBe(false);
        expect(result.current("academic-1")).toBe(false);
    });
});
