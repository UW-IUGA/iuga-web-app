import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { buildMonthGrid } from "../../utils/calendar/calendar";
import Card from "./Card";

// Stands in for a caller: every day is one marked element, so the tests can
// count what the frame drew without caring what a real day looks like.
const drawDay = (cell) => <span className="probe">{cell.id}</span>;

afterEach(cleanup);

describe("Card", () => {
    it("takes the covered grid out of reach until the day overlay closes", () => {
        const { container, rerender } = render(
            <Card title="October 2026" rows={[]} renderDay={drawDay} isDayOverlayOpen />,
        );

        expect(container.querySelector(".card-grid").hasAttribute("inert")).toBe(true);

        rerender(<Card title="October 2026" rows={[]} renderDay={drawDay} isDayOverlayOpen={false} />);

        expect(container.querySelector(".card-grid").hasAttribute("inert")).toBe(false);
    });

    it("announces the current month when marked by its parent", () => {
        const { rerender } = render(<Card title="October 2026" rows={[]} renderDay={drawDay} isCurrentMonth />);

        expect(screen.getByRole("heading", { name: /October 2026\s*, this month/ })).toBeTruthy();

        rerender(<Card title="October 2026" rows={[]} renderDay={drawDay} isCurrentMonth={false} />);

        expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
        expect(screen.queryByText(", this month")).toBeNull();
    });

    it("names the month", () => {
        render(<Card title="October 2026" rows={buildMonthGrid(2026, 9, [])} renderDay={drawDay} />);

        expect(screen.getByText("October 2026")).toBeTruthy();
    });

    it("draws every day with renderDay, in grid order", () => {
        const renderDay = vi.fn(drawDay);
        const { container } = render(
            <Card title="October 2026" rows={buildMonthGrid(2026, 9, [])} renderDay={renderDay} />,
        );

        expect(container.querySelectorAll(".probe")).toHaveLength(42);
        expect(renderDay.mock.calls.map(([cell]) => cell.id)).toEqual(Array.from({ length: 42 }, (_, index) => index));
    });

    it("passes each day's column to renderDay, Sunday first", () => {
        const renderDay = vi.fn(drawDay);
        render(<Card title="October 2026" rows={buildMonthGrid(2026, 9, [])} renderDay={renderDay} />);

        // Index 6 is the last column of the first week; index 7 starts the second.
        expect(renderDay.mock.calls[6][1]).toBe(6);
        expect(renderDay.mock.calls[7][1]).toBe(0);
    });
});
