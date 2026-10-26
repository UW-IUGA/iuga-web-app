import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { zonedParts } from "../utils/calendar/calendar";
import useCalendarView from "./useCalendarView";

// Today's wall date in the site's zone, the form the URL stores.
function todayISO() {
    const { year, month, day } = zonedParts(new Date());
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// The hook under a router opened at `entry`, alongside the router's own view
// of the URL, so a test can read what was written and walk history.
function setup(entry = "/events") {
    const wrapper = ({ children }) => <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>;
    const rendered = renderHook(() => ({ ...useCalendarView(), location: useLocation(), navigate: useNavigate() }), {
        wrapper,
    });
    const written = () => new URLSearchParams(rendered.result.current.location.search);
    return { ...rendered, written };
}

afterEach(cleanup);

describe("useCalendarView", () => {
    it("defaults to the month view on today", () => {
        const { result } = setup("/events");

        expect(result.current.mode).toBe("month");
        expect(result.current.isDefaultMode).toBe(true);
        expect(result.current.selectedDate.toDateString()).toBe(new Date().toDateString());
    });

    it("reads the view out of the URL", () => {
        const { result } = setup("/events?view=week&date=2026-10-20");

        expect(result.current.mode).toBe("week");
        expect(result.current.isDefaultMode).toBe(false);
    });

    it("rebuilds the selected date as local midnight of the stored day", () => {
        const { result } = setup("/events?view=day&date=2026-10-20");

        expect(zonedParts(result.current.selectedDate)).toMatchObject({ year: 2026, month: 9, day: 20, hour: 0 });
    });

    it("falls back to month for an unknown view", () => {
        const { result } = setup("/events?view=fortnight");

        expect(result.current.mode).toBe("month");
    });

    it("falls back to today for a malformed date", () => {
        const { result } = setup("/events?date=whenever");

        expect(result.current.selectedDate.toDateString()).toBe(new Date().toDateString());
    });

    it("writes a chosen view into the URL, keeping the page", () => {
        const { result, written } = setup("/events?date=2026-10-20");

        act(() => result.current.setMode("week"));

        expect(result.current.location.pathname).toBe("/events");
        expect(written().get("view")).toBe("week");
        expect(written().get("date")).toBe("2026-10-20");
    });

    it("omits the view when it is the default", () => {
        const { result, written } = setup("/events?view=week&date=2026-10-20");

        act(() => result.current.setMode("month"));

        expect(written().has("view")).toBe(false);
        expect(written().get("date")).toBe("2026-10-20");
    });

    it("keeps the selected date when switching view", () => {
        const { result, written } = setup("/events?view=week&date=2026-10-20");

        act(() => result.current.setMode("day"));

        expect(written().get("view")).toBe("day");
        expect(written().get("date")).toBe("2026-10-20");
    });

    it("leaves query parameters it does not own alone", () => {
        const { result, written } = setup("/events?ref=newsletter&date=2026-10-20");

        act(() => result.current.step(1));

        expect(written().get("ref")).toBe("newsletter");
    });

    it("reads the year view out of the URL", () => {
        const { result } = setup("/events?view=year&date=2026-10-20");

        expect(result.current.mode).toBe("year");
        expect(result.current.isDefaultMode).toBe(false);
    });

    it("steps the month view a month at a time", () => {
        const { result, written } = setup("/events?date=2026-10-20");

        act(() => result.current.step(1));

        expect(written().get("date")).toBe("2026-11-20");
        expect(written().has("view")).toBe(false);
    });

    it("clamps a month step to the end of a shorter month", () => {
        const { result, written } = setup("/events?date=2026-01-31");

        act(() => result.current.step(1));

        expect(written().get("date")).toBe("2026-02-28");
    });

    it("steps the week view a week at a time", () => {
        const { result, written } = setup("/events?view=week&date=2026-10-20");

        act(() => result.current.step(-1));

        // Lands on the start of the previous week.
        expect(written().get("date")).toBe("2026-10-11");
        expect(written().get("view")).toBe("week");
    });

    it("steps the day view a day at a time, across a month boundary", () => {
        const { result, written } = setup("/events?view=day&date=2026-10-31");

        act(() => result.current.step(1));

        expect(written().get("date")).toBe("2026-11-01");
        expect(written().get("view")).toBe("day");
    });

    it("records every step in history, so Back retraces it", () => {
        const { result, written } = setup("/events?view=week&date=2026-10-20");

        act(() => result.current.step(1));
        act(() => result.current.step(1));
        act(() => result.current.navigate(-1));

        expect(written().get("date")).toBe("2026-10-25");
        act(() => result.current.navigate(-1));
        expect(written().get("date")).toBe("2026-10-20");
        expect(zonedParts(result.current.selectedDate)).toMatchObject({ month: 9, day: 20 });
    });

    it("moves to a date without changing the view", () => {
        for (const view of ["week", "day"]) {
            const { result, written, unmount } = setup(`/events?view=${view}&date=2026-10-20`);

            act(() => result.current.goToDate(new Date("2026-12-09T20:00:00.000Z")));

            expect(written().get("date")).toBe("2026-12-09");
            expect(written().get("view")).toBe(view);
            unmount();
        }
    });

    it("keeps the month view on a date pick, too", () => {
        const { result, written } = setup("/events?date=2026-10-20");

        act(() => result.current.goToDate(new Date("2026-12-09T20:00:00.000Z")));

        expect(written().get("date")).toBe("2026-12-09");
        expect(written().has("view")).toBe(false);
    });

    it("does not step the year view", () => {
        const { result, written } = setup("/events?view=year&date=2026-10-20");

        act(() => result.current.step(1));

        expect(written().get("date")).toBe("2026-10-20");
    });

    it("moves the month view to the current month and stays in month view", () => {
        const { result, written } = setup("/events?date=2024-04-08");

        act(() => result.current.goToToday());

        expect(written().get("view")).toBeNull();
        expect(written().get("date")).toBe(todayISO());
    });

    it("moves the week view to the current week and stays in week view", () => {
        const { result, written } = setup("/events?view=week&date=2024-04-08");

        act(() => result.current.goToToday());

        expect(written().get("view")).toBe("week");
        expect(written().get("date")).toBe(todayISO());
    });

    it("feeds a written URL back into the selected date", () => {
        const { result } = setup("/events?view=week&date=2026-10-20");

        act(() => result.current.goToDay(new Date("2026-10-20T20:00:00.000Z")));

        expect(result.current.mode).toBe("day");
        expect(zonedParts(result.current.selectedDate)).toMatchObject({ month: 9, day: 20 });
    });

    it("jumps straight to day mode from a date", () => {
        const { result, written } = setup("/events?view=week&date=2026-10-20");

        act(() => result.current.goToDay(new Date("2026-11-05T20:00:00.000Z")));

        expect(written().get("view")).toBe("day");
        expect(written().get("date")).toBe("2026-11-05");
    });

    it("jumps to day mode from the year view too", () => {
        const { result, written } = setup("/events?view=year&date=2026-10-20");

        act(() => result.current.goToDay(new Date("2024-04-08T20:00:00.000Z")));

        expect(written().get("view")).toBe("day");
        expect(written().get("date")).toBe("2024-04-08");
    });

    it("exposes the seven dates of the selected week", () => {
        const { result } = setup("/events?view=week&date=2026-10-20");

        expect(result.current.weekDates).toHaveLength(7);
        expect(result.current.weekDates.map((d) => zonedParts(d).day)).toEqual([18, 19, 20, 21, 22, 23, 24]);
    });
});
