import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { buildMonthGrid, normalizeEvent, zonedParts } from "../../utils/calendar/calendar";
import MonthCard from "./MonthCard";

// Tweens finish the moment they start, so the open and close sequences run to
// completion synchronously and the tests can assert on where they end up.
vi.mock("gsap", () => {
    const run = (vars = {}) => {
        vars.onStart?.();
        vars.onComplete?.();
    };
    return {
        gsap: {
            to: (_target, vars) => run(vars),
            fromTo: (_target, _from, vars) => run(vars),
            set: () => {},
            killTweensOf: () => {},
            utils: { random: () => 0 },
        },
    };
});

// 17:00Z is 10am Pacific, safely inside the day. The 22nd is a Thursday and
// the 18th a Sunday, the month grid's first column.
const at = (id, name, hour = 17, day = 22) =>
    normalizeEvent({
        eId: id,
        eName: name,
        eStartDate: `2026-10-${day}T${hour}:00:00Z`,
        eEndDate: `2026-10-${day}T${hour + 1}:00:00Z`,
        eLabels: ["Career"],
    });

function renderMonth(events = [at("panel", "Industry Panel")], title = "October 2026") {
    const onPickDay = vi.fn();
    const view = render(<MonthCard title={title} rows={buildMonthGrid(2026, 9, events)} onPickDay={onPickDay} />);
    return { ...view, onPickDay };
}

const chip = (name) => screen.getByRole("button", { name });

afterEach(cleanup);

describe("MonthCard", () => {
    it("opens an event in a popover beside its chip", () => {
        const { container, onPickDay } = renderMonth();

        fireEvent.click(chip("Industry Panel"));

        const dialog = screen.getByRole("dialog", { name: "Industry Panel" });
        expect(within(dialog).getByText("Thursday, October 22, 2026")).toBeTruthy();
        expect(chip("Industry Panel").getAttribute("aria-expanded")).toBe("true");
        // A popover, not the old full-card zoom.
        expect(container.querySelector(".card--open")).toBeNull();
        expect(container.querySelector(".card-content")).toBeNull();
        // Opening is not navigating.
        expect(onPickDay).not.toHaveBeenCalled();
    });

    it("opens a Sunday event to the right, into the month", () => {
        renderMonth([at("brunch", "Sunday Brunch", 17, 18)]);

        fireEvent.click(chip("Sunday Brunch"));

        expect(screen.getByRole("dialog").classList).toContain("popover--right");
    });

    it("opens any other day to the left", () => {
        renderMonth();

        fireEvent.click(chip("Industry Panel"));

        expect(screen.getByRole("dialog").classList).toContain("popover--left");
    });

    it("shows only the event that was clicked, not the whole day", () => {
        renderMonth([at("a", "Morning Panel", 16), at("b", "Lunch Social", 19)]);

        fireEvent.click(chip("Lunch Social"));

        const dialog = screen.getByRole("dialog");
        expect(within(dialog).getByText("Lunch Social")).toBeTruthy();
        expect(within(dialog).queryByText("Morning Panel")).toBeNull();
    });

    it('opens the whole day from "+N more"', () => {
        const many = [16, 17, 18, 19, 20].map((hour, i) => at(`e${i}`, `Event ${i}`, hour));
        renderMonth(many);

        fireEvent.click(chip("+2 more events on Thursday, October 22"));

        const dialog = screen.getByRole("dialog", { name: "Events on Thursday, October 22, 2026" });
        expect(dialog.querySelectorAll(".detail")).toHaveLength(5);
    });

    it("moves focus into the popover and back to the chip on close", () => {
        renderMonth();
        const event = chip("Industry Panel");

        fireEvent.click(event);
        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));

        fireEvent.click(screen.getByRole("button", { name: "Close" }));

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(event);
        expect(event.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes on Escape", () => {
        renderMonth();
        const event = chip("Industry Panel");

        fireEvent.click(event);
        fireEvent.keyDown(document.body, { key: "Escape" });

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(event);
    });

    it("closes on a press outside it, but not on another chip", () => {
        const { container } = renderMonth([at("a", "Morning Panel", 16), at("b", "Lunch Social", 19)]);

        fireEvent.click(chip("Morning Panel"));
        // Another chip: it opens that one in place instead.
        fireEvent.pointerDown(chip("Lunch Social"));
        fireEvent.click(chip("Lunch Social"));
        expect(screen.getByRole("dialog", { name: "Lunch Social" })).toBeTruthy();

        fireEvent.pointerDown(container.querySelector(".card-title"));
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("goes to the day view from the popover", () => {
        const { onPickDay } = renderMonth();

        fireEvent.click(chip("Industry Panel"));
        fireEvent.click(screen.getByRole("button", { name: "View day" }));

        expect(onPickDay).toHaveBeenCalledTimes(1);
        expect(zonedParts(onPickDay.mock.calls[0][0])).toMatchObject({ month: 9, day: 22 });
    });

    it("still goes to the day view from a day itself", () => {
        const { onPickDay } = renderMonth();

        fireEvent.click(screen.getByRole("button", { name: "Thursday, October 22, 1 event" }));

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(zonedParts(onPickDay.mock.calls[0][0])).toMatchObject({ month: 9, day: 22 });
    });

    it("closes, and stays closed, when the month changes under it", () => {
        const events = [at("panel", "Industry Panel")];
        const { rerender } = renderMonth(events);

        fireEvent.click(chip("Industry Panel"));
        rerender(<MonthCard title="November 2026" rows={buildMonthGrid(2026, 10, [])} onPickDay={vi.fn()} />);
        expect(screen.queryByRole("dialog")).toBeNull();

        rerender(<MonthCard title="October 2026" rows={buildMonthGrid(2026, 9, events)} onPickDay={vi.fn()} />);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("keeps the chips and the day button as siblings, never nested", () => {
        const { container } = renderMonth();

        expect(container.querySelector("button button")).toBeNull();
    });
});
