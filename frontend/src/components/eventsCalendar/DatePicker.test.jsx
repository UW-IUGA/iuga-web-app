import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MOBILE_QUERY } from "../../utils/calendar/breakpoints";
import { formatLongDay, normalizeEvent, zonedParts } from "../../utils/calendar/calendar";
import CalendarToolbar from "./CalendarToolbar";

// Tue Oct 20 2026, 1pm Pacific.
const anchor = () => new Date("2026-10-20T20:00:00.000Z");

const events = [
    normalizeEvent({
        eId: 1,
        eName: "Study Jam",
        eStartDate: "2026-10-22T01:00:00.000Z",
        eEndDate: "2026-10-22T02:30:00.000Z",
        eLabels: ["Academic"],
    }),
];

// A phone, or reduced motion, or both, as matchMedia would report them.
function stubMedia({ phone = true, reduce = true } = {}) {
    window.matchMedia = (query) => ({
        matches: (query === MOBILE_QUERY && phone) || (query.includes("reduce") && reduce),
        media: query,
        addEventListener() {},
        removeEventListener() {},
    });
}

function renderToolbar(mode = "week") {
    const onPickDate = vi.fn();
    render(
        <CalendarToolbar
            mode={mode}
            anchor={anchor()}
            events={events}
            onModeChange={vi.fn()}
            onToday={vi.fn()}
            onStep={vi.fn()}
            onPickDate={onPickDate}
        />,
    );
    return { onPickDate };
}

const toggle = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const shown = (date) => {
    const { year, month, day } = zonedParts(date);
    return `${year}-${month + 1}-${day}`;
};

beforeEach(() => stubMedia());
afterEach(() => {
    cleanup();
    delete window.matchMedia;
});

describe("date picker", () => {
    it("replaces the range with a button on a phone, and only there", () => {
        renderToolbar("week");

        const button = toggle("Oct 18 – Oct 24, 2026");
        expect(button.getAttribute("aria-expanded")).toBe("false");
        // Points at the panel only while there is one.
        expect(button.hasAttribute("aria-controls")).toBe(false);
        fireEvent.click(button);
        expect(document.getElementById(button.getAttribute("aria-controls"))).toBe(
            document.querySelector(".picker__panel"),
        );
        fireEvent.click(button);
        // Says what it opens, after the range it shows (2.5.3).
        expect(button.textContent).toBe("Oct 18 – Oct 24, 2026, choose date");
        // One range on the page, so a screen reader never hears two announced.
        expect(document.querySelector(".toolbar__range")).toBeNull();
        cleanup();

        stubMedia({ phone: false });
        renderToolbar("week");
        expect(document.querySelector(".picker")).toBeNull();
        expect(document.querySelector(".toolbar__range").textContent).toBe("Oct 18 – Oct 24, 2026");
    });

    it("comes first in the toolbar, so Tab meets it first, as it is seen", () => {
        renderToolbar("week");

        expect(document.querySelector(".toolbar").firstElementChild.className).toBe("picker");
    });

    it("is not offered in year view, which does not step", () => {
        renderToolbar("year");

        expect(document.querySelector(".picker")).toBeNull();
        expect(screen.getByText("All Events")).toBeTruthy();
    });

    it("opens just the months in month view, and goes to the one picked", () => {
        const { onPickDate } = renderToolbar("month");

        fireEvent.click(toggle("October 2026"));

        const strip = screen.getByRole("group", { name: "Months" });
        expect(document.querySelector(".mini__body")).toBeNull();
        const october = within(strip).getByRole("button", { name: "Oct 2026" });
        expect(october.getAttribute("aria-current")).toBe("date");

        fireEvent.click(within(strip).getByRole("button", { name: "Jan 2027" }));

        expect(shown(onPickDate.mock.calls[0][0])).toBe("2027-1-1");
        // Closed, with focus back on the button that opened it.
        expect(screen.queryByRole("group", { name: "Months" })).toBeNull();
        expect(document.activeElement).toBe(toggle("October 2026"));
    });

    it("opens the months over a mini month in week and day view", () => {
        for (const mode of ["week", "day"]) {
            renderToolbar(mode);
            fireEvent.click(document.querySelector(".picker__toggle"));

            expect(screen.getByRole("group", { name: "Months" })).toBeTruthy();
            expect(document.querySelectorAll(".picker .mini__day").length).toBeGreaterThanOrEqual(28);
            cleanup();
        }
    });

    it("browses the mini month from the strip, without moving the view", () => {
        const { onPickDate } = renderToolbar("week");
        fireEvent.click(document.querySelector(".picker__toggle"));

        fireEvent.click(screen.getByRole("button", { name: "Dec 2026" }));

        expect(document.querySelector(".picker__month-label").textContent).toBe("December 2026");
        expect(onPickDate).not.toHaveBeenCalled();
        // Still open, so a day can be picked from the month now showing.
        expect(screen.getByRole("group", { name: "Months" })).toBeTruthy();
    });

    it("goes to a day picked in the mini month, and closes", () => {
        const { onPickDate } = renderToolbar("week");
        fireEvent.click(document.querySelector(".picker__toggle"));

        const day = new Date("2026-10-22T19:00:00.000Z");
        fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${formatLongDay(day)}`) }));

        expect(shown(onPickDate.mock.calls[0][0])).toBe("2026-10-22");
        expect(document.querySelector(".picker__panel")).toBeNull();
    });

    it("swipes the mini month to the next or previous month", async () => {
        renderToolbar("week");
        fireEvent.click(document.querySelector(".picker__toggle"));
        const body = document.querySelector(".picker .mini__body");

        const touch = (type, x) => {
            const event = new Event(type, { bubbles: true, cancelable: true });
            Object.defineProperty(event, "touches", { value: x == null ? [] : [{ clientX: x, clientY: 100 }] });
            body.dispatchEvent(event);
        };
        const swipe = async (dx) =>
            act(async () => {
                touch("touchstart", 500);
                touch("touchmove", 500 + dx);
                touch("touchend");
            });

        await swipe(-120);
        expect(document.querySelector(".picker__month-label").textContent).toBe("November 2026");

        await swipe(120);
        await swipe(120);
        expect(document.querySelector(".picker__month-label").textContent).toBe("September 2026");
    });

    it("closes on Escape, handing focus back to the button", () => {
        renderToolbar("day");
        fireEvent.click(document.querySelector(".picker__toggle"));

        fireEvent.keyDown(screen.getByRole("button", { name: "Oct 2026" }), { key: "Escape" });

        expect(document.querySelector(".picker__panel")).toBeNull();
        expect(document.activeElement).toBe(document.querySelector(".picker__toggle"));
        expect(document.activeElement.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes on a click of empty space outside it, leaving focus be", () => {
        renderToolbar("week");
        fireEvent.click(document.querySelector(".picker__toggle"));

        fireEvent.click(document.body);

        expect(document.querySelector(".picker__panel")).toBeNull();
        expect(document.querySelector(".picker__toggle").getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).not.toBe(document.querySelector(".picker__toggle"));
    });

    it("stays open through the press, so the controls below do not move under the finger", () => {
        renderToolbar("week");
        fireEvent.click(document.querySelector(".picker__toggle"));

        fireEvent.pointerDown(screen.getByRole("button", { name: "Next week" }));

        expect(document.querySelector(".picker__panel")).toBeTruthy();
    });

    it("closes when another control is clicked, which still acts", () => {
        const onStep = vi.fn();
        render(
            <CalendarToolbar
                mode="week"
                anchor={anchor()}
                events={events}
                onModeChange={vi.fn()}
                onToday={vi.fn()}
                onStep={onStep}
                onPickDate={vi.fn()}
            />,
        );
        fireEvent.click(document.querySelector(".picker__toggle"));

        fireEvent.click(screen.getByRole("button", { name: "Next week" }));

        expect(document.querySelector(".picker__panel")).toBeNull();
        expect(onStep).toHaveBeenCalledWith(1);
    });

    it("stays open for clicks inside it", () => {
        renderToolbar("week");
        fireEvent.click(document.querySelector(".picker__toggle"));

        fireEvent.click(document.querySelector(".picker__panel"));
        fireEvent.click(screen.getByRole("button", { name: "Dec 2026" }));

        expect(document.querySelector(".picker__panel")).toBeTruthy();
    });

    it("closes when the view moves under it, as a swipe of the calendar does", () => {
        const props = {
            mode: "week",
            events,
            onModeChange: vi.fn(),
            onToday: vi.fn(),
            onStep: vi.fn(),
            onPickDate: vi.fn(),
        };
        const { rerender } = render(<CalendarToolbar {...props} anchor={anchor()} />);
        fireEvent.click(document.querySelector(".picker__toggle"));

        rerender(<CalendarToolbar {...props} anchor={new Date("2026-10-27T20:00:00.000Z")} />);

        expect(document.querySelector(".picker__panel")).toBeNull();
    });

    it("closes when focus is tabbed out of it, but not on a blur to nowhere", () => {
        renderToolbar("week");
        fireEvent.click(document.querySelector(".picker__toggle"));
        const month = screen.getByRole("button", { name: "Oct 2026" });

        // Safari, after a tap inside: the button blurs, and nothing takes focus.
        fireEvent.blur(month, { relatedTarget: null });
        expect(document.querySelector(".picker__panel")).toBeTruthy();

        fireEvent.blur(month, { relatedTarget: screen.getByRole("button", { name: "Today" }) });
        expect(document.querySelector(".picker__panel")).toBeNull();
    });

    it("stops listening for clicks once closed", () => {
        const remove = vi.spyOn(document, "removeEventListener");
        renderToolbar("week");
        fireEvent.click(document.querySelector(".picker__toggle"));

        fireEvent.click(document.querySelector(".picker__toggle"));

        expect(remove).toHaveBeenCalledWith("click", expect.any(Function), true);
        remove.mockRestore();
    });

    it("makes the strip one Tab stop, moved along with the arrow keys", () => {
        renderToolbar("month");
        fireEvent.click(toggle("October 2026"));

        const strip = screen.getByRole("group", { name: "Months" });
        const tabbable = within(strip)
            .getAllByRole("button")
            .filter((month) => month.tabIndex === 0);
        expect(tabbable.map((month) => month.textContent)).toEqual(["Oct 2026"]);

        tabbable[0].focus();
        fireEvent.keyDown(tabbable[0], { key: "ArrowRight" });
        expect(document.activeElement.textContent).toBe("Nov 2026");
        fireEvent.keyDown(document.activeElement, { key: "Home" });
        expect(document.activeElement.textContent).toBe("Jan 2025");
    });

    it("shows the year where one begins, and names it on every month", () => {
        renderToolbar("month");
        fireEvent.click(toggle("October 2026"));

        const january = screen.getByRole("button", { name: "Jan 2027" });
        expect(january.querySelector(".strip__year")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Feb 2027" }).querySelector(".sr-only")).toBeTruthy();
    });
});
