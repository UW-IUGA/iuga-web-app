import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { normalizeEvent, zonedParts } from "../../utils/calendar/calendar";
import MiniMonth from "./MiniMonth";

const anchor = () => new Date("2026-10-20T20:00:00.000Z");

function renderMini({ events = [], onPickDay = vi.fn() } = {}) {
    const view = render(<MiniMonth anchor={anchor()} events={events} onPickDay={onPickDay} />);
    return { ...view, onPickDay };
}

// Flat index of a day cell inside the 6x7 grid, mirroring buildMonthGrid's
// placement. Derived rather than hardcoded so the tests survive a fixture
// change — the grid shifts with the first weekday of the month.
function dayIndex(year, month, day) {
    return new Date(Date.UTC(year, month, 1)).getUTCDay() + day - 1;
}

const cellAt = (container, index) => container.querySelectorAll(".mini__day")[index];

afterEach(cleanup);

describe("MiniMonth", () => {
    it("names the month holding the anchor", () => {
        renderMini();

        expect(screen.getByText("October 2026")).toBeTruthy();
    });

    it("marks the anchor day as current", () => {
        const { container } = renderMini();

        const current = container.querySelector('[aria-current="date"]');
        expect(current.textContent).toBe("20");
    });

    it("shows six rows of seven days", () => {
        const { container } = renderMini();

        expect(container.querySelectorAll(".mini__week")).toHaveLength(6);
        expect(container.querySelectorAll(".mini__day")).toHaveLength(42);
    });

    it("dims the days spilling in from adjacent months", () => {
        const { container } = renderMini();

        const out = container.querySelectorAll(".mini__day--out");
        expect(out.length).toBeGreaterThan(0);
    });

    it("puts a dot on days that have events", () => {
        // 17:00Z is 10am Pacific, safely inside Oct 23 — unlike a midnight
        // instant, which would read as the previous evening.
        const events = [
            normalizeEvent({
                eId: "a",
                eName: "Panel",
                eStartDate: "2026-10-23T17:00:00Z",
                eEndDate: "2026-10-23T19:00:00Z",
                eLabels: ["Career"],
            }),
        ];
        const { container } = renderMini({ events });

        const dots = container.querySelectorAll(".mini__dot");
        expect(dots).toHaveLength(1);
        expect(cellAt(container, dayIndex(2026, 9, 23)).querySelector(".mini__dot")).toBeTruthy();
    });

    it("ignores events from other months", () => {
        const events = [
            normalizeEvent({
                eId: "a",
                eName: "Panel",
                eStartDate: "2026-11-23T00:00:00Z",
                eEndDate: "2026-11-23T02:00:00Z",
            }),
        ];
        const { container } = renderMini({ events });

        expect(container.querySelectorAll(".mini__dot")).toHaveLength(0);
    });

    it("reports the picked day as a calendar date", () => {
        const { container, onPickDay } = renderMini();

        fireEvent.click(cellAt(container, dayIndex(2026, 9, 21)));

        expect(onPickDay).toHaveBeenCalledTimes(1);
        const picked = onPickDay.mock.calls[0][0];
        expect(zonedParts(picked)).toMatchObject({ year: 2026, month: 9, day: 21, hour: 0 });
    });

    it("can pick a day from the adjacent month", () => {
        const { container, onPickDay } = renderMini();

        // Flat index 0 is Sun Sep 27 2026.
        fireEvent.click(cellAt(container, 0));

        expect(zonedParts(onPickDay.mock.calls[0][0])).toMatchObject({ month: 8, day: 27 });
    });

    it("browses back a month without moving the view", () => {
        const { onPickDay } = renderMini();

        fireEvent.click(screen.getByLabelText("Show previous month"));

        expect(screen.getByText("September 2026")).toBeTruthy();
        expect(onPickDay).not.toHaveBeenCalled();
    });

    it("browses forward a month", () => {
        renderMini();

        fireEvent.click(screen.getByLabelText("Show next month"));

        expect(screen.getByText("November 2026")).toBeTruthy();
    });

    it("browses across a year boundary", () => {
        renderMini();

        for (let i = 0; i < 3; i++) fireEvent.click(screen.getByLabelText("Show next month"));

        expect(screen.getByText("January 2027")).toBeTruthy();
    });

    it("has no Today control of its own — the toolbar owns it", () => {
        renderMini();

        expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
    });

    it("follows the anchor into a new month", () => {
        const { rerender } = renderMini();

        rerender(<MiniMonth anchor={new Date("2026-12-05T20:00:00.000Z")} events={[]} onPickDay={vi.fn()} />);

        expect(screen.getByText("December 2026")).toBeTruthy();
    });

    it("snaps back to the anchor month when the anchor moves within it", () => {
        const { rerender } = renderMini();

        fireEvent.click(screen.getByLabelText("Show next month"));
        expect(screen.getByText("November 2026")).toBeTruthy();

        // A toolbar step a week on, still inside October.
        rerender(<MiniMonth anchor={new Date("2026-10-27T20:00:00.000Z")} events={[]} onPickDay={vi.fn()} />);

        expect(screen.getByText("October 2026")).toBeTruthy();
    });

    it("stays where it was browsed while nothing outside it changes", () => {
        const { rerender } = renderMini();

        fireEvent.click(screen.getByLabelText("Show next month"));
        rerender(<MiniMonth anchor={anchor()} events={[]} onPickDay={vi.fn()} />);

        expect(screen.getByText("November 2026")).toBeTruthy();
    });

    it("snaps back on a new syncKey even when the anchor has not moved", () => {
        const { rerender } = renderMini();

        fireEvent.click(screen.getByLabelText("Show next month"));
        rerender(<MiniMonth anchor={anchor()} events={[]} onPickDay={vi.fn()} syncKey={1} />);

        expect(screen.getByText("October 2026")).toBeTruthy();
    });
});
