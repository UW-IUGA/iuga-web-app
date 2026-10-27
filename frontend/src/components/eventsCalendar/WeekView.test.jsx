import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { normalizeEvent } from "../../utils/calendar/calendar";
import WeekView from "./WeekView";

// Tweens finish the moment they start, so the popover's open and close run to
// completion synchronously.
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

const anchor = () => new Date("2026-10-20T20:00:00.000Z");

function renderWeek({ events = [], onSelectDay = vi.fn() } = {}) {
    return {
        onSelectDay,
        ...render(<WeekView anchor={anchor()} events={events} onSelectDay={onSelectDay} />),
    };
}

// Wire shape in, normalized event out — buildDayColumns reads .start/.end,
// so raw eStartDate keys would silently render nothing.
const timed = (id, name, start, end, labels = []) =>
    normalizeEvent({
        eId: id,
        eName: name,
        eStartDate: start,
        eEndDate: end,
        eLabels: labels,
    });

afterEach(cleanup);

describe("WeekView", () => {
    it("renders seven day columns", () => {
        const { container } = renderWeek();

        expect(container.querySelectorAll(".grid__col")).toHaveLength(7);
        expect(container.querySelectorAll(".grid__dayhead")).toHaveLength(7);
    });

    it("heads the columns with the days of the anchor week", () => {
        renderWeek();

        expect(screen.getByRole("button", { name: /Sun\s*18/ })).toBeTruthy();
        expect(screen.getByRole("button", { name: /Sat\s*24/ })).toBeTruthy();
    });

    it("draws an hour gutter", () => {
        const { container } = renderWeek();

        expect(container.querySelectorAll(".grid__hour")).toHaveLength(24 * 7);
    });

    it("renders an event on its day", () => {
        const { container } = renderWeek({
            events: [timed("a", "Coffee & Networking", "2026-10-20T17:00:00Z", "2026-10-20T18:30:00Z")],
        });

        expect(screen.getByText("Coffee & Networking")).toBeTruthy();
        expect(container.querySelectorAll(".grid__event")).toHaveLength(1);
    });

    it("cascades overlapping events, the later one on top", () => {
        const { container } = renderWeek({
            events: [
                timed("a", "Coffee & Networking", "2026-10-20T17:00:00Z", "2026-10-20T18:30:00Z"),
                timed("b", "Design Workshop", "2026-10-20T17:30:00Z", "2026-10-20T19:00:00Z"),
            ],
        });

        const events = container.querySelectorAll(".grid__event");
        expect(events).toHaveLength(2);

        // The earlier event reaches on under the later one, which starts halfway
        // across and runs to the column's edge.
        expect([...events].map((el) => el.style.left)).toEqual(["calc(0% + 1px)", "calc(50% + 1px)"]);
        expect([...events].map((el) => el.style.width)).toEqual(["calc(85% - 2px)", "calc(50% - 2px)"]);
        expect(Number(events[1].style.zIndex)).toBeGreaterThan(Number(events[0].style.zIndex));
    });

    it("keeps overlapping events inside their own day column", () => {
        const { container } = renderWeek({
            events: [
                timed("a", "Coffee & Networking", "2026-10-20T17:00:00Z", "2026-10-20T18:30:00Z"),
                timed("b", "Design Workshop", "2026-10-20T17:30:00Z", "2026-10-20T19:00:00Z"),
                timed("c", "Office Hours", "2026-10-20T17:45:00Z", "2026-10-20T18:15:00Z"),
            ],
        });

        const tuesday = container.querySelectorAll(".grid__col")[2];
        expect(tuesday.querySelectorAll(".grid__event")).toHaveLength(3);
        expect(container.querySelectorAll(".grid__event")).toHaveLength(3);
    });

    it("gives a lone event the full column width", () => {
        const { container } = renderWeek({
            events: [timed("a", "Study Jam", "2026-10-22T01:00:00Z", "2026-10-22T02:30:00Z")],
        });

        expect(container.querySelector(".grid__event").style.width).toBe("calc(100% - 2px)");
    });

    it("shows a now-line only on the column for today", () => {
        // Pinned inside the anchor week. Read from the real clock, this only held
        // while the real today fell between Oct 18 and 24, 2026.
        vi.useFakeTimers({ now: new Date("2026-10-21T19:00:00Z"), toFake: ["Date"] });
        try {
            const { container } = renderWeek();

            expect(container.querySelectorAll(".grid__now")).toHaveLength(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it("positions an event down the column by its start time", () => {
        const { container } = renderWeek({
            events: [
                // 10am Pacific, i.e. 600 of 1440 minutes in.
                timed("a", "Coffee & Networking", "2026-10-20T17:00:00Z", "2026-10-20T18:30:00Z"),
            ],
        });

        const event = container.querySelector(".grid__event");
        expect(event.style.top).toBe(`${(600 / 1440) * 100}%`);
        expect(event.style.height).toBe(`${(90 / 1440) * 100}%`);
    });

    it("asks to open a day when its header is clicked", () => {
        const { onSelectDay } = renderWeek();

        fireEvent.click(screen.getByRole("button", { name: /Thu\s*22/ }));

        expect(onSelectDay).toHaveBeenCalledTimes(1);
        expect(onSelectDay.mock.calls[0][0].toISOString().slice(0, 10)).toBe("2026-10-22");
    });

    describe("event popover", () => {
        // Tue Oct 20, 10am Pacific; and Sun Oct 18, the first column.
        const tuesday = () =>
            timed("t", "Coffee & Networking", "2026-10-20T17:00:00Z", "2026-10-20T18:30:00Z", ["Career"]);
        const sunday = () => timed("s", "Sunday Brunch", "2026-10-18T17:00:00Z", "2026-10-18T18:30:00Z", ["Social"]);

        const eventButton = (name) => screen.getByRole("button", { name: new RegExp(name) });

        it("opens the event in a popover when it is clicked", () => {
            const { onSelectDay } = renderWeek({ events: [tuesday()] });

            fireEvent.click(eventButton("Coffee & Networking"));

            const dialog = screen.getByRole("dialog", { name: "Coffee & Networking" });
            expect(within(dialog).getByText("Tuesday, October 20, 2026")).toBeTruthy();
            expect(eventButton("Coffee & Networking").getAttribute("aria-expanded")).toBe("true");
            // Opening is not navigating.
            expect(onSelectDay).not.toHaveBeenCalled();
        });

        it("hands scrolling back to the stylesheet once the open animation lands", () => {
            renderWeek({ events: [tuesday()] });

            fireEvent.click(eventButton("Coffee & Networking"));

            // Clipped while it animates (the mock finishes at once), then released.
            expect(screen.getByRole("dialog").style.overflow).toBe("");
        });

        it("opens a Sunday event to the right, into the week", () => {
            renderWeek({ events: [sunday()] });

            fireEvent.click(eventButton("Sunday Brunch"));

            expect(screen.getByRole("dialog").classList).toContain("popover--right");
        });

        it("opens any other day to the left", () => {
            renderWeek({ events: [tuesday()] });

            fireEvent.click(eventButton("Coffee & Networking"));

            expect(screen.getByRole("dialog").classList).toContain("popover--left");
        });

        it("moves focus into the popover, to its close button", () => {
            renderWeek({ events: [tuesday()] });

            fireEvent.click(eventButton("Coffee & Networking"));

            expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
        });

        it("closes from its close button and hands focus back to the event", () => {
            renderWeek({ events: [tuesday()] });
            const event = eventButton("Coffee & Networking");

            fireEvent.click(event);
            fireEvent.click(screen.getByRole("button", { name: "Close" }));

            expect(screen.queryByRole("dialog")).toBeNull();
            expect(document.activeElement).toBe(event);
            expect(event.getAttribute("aria-expanded")).toBe("false");
        });

        it("closes on Escape", () => {
            renderWeek({ events: [tuesday()] });
            const event = eventButton("Coffee & Networking");

            fireEvent.click(event);
            fireEvent.keyDown(document.body, { key: "Escape" });

            expect(screen.queryByRole("dialog")).toBeNull();
            expect(document.activeElement).toBe(event);
        });

        it("closes on a press outside it", () => {
            const { container } = renderWeek({ events: [tuesday()] });

            fireEvent.click(eventButton("Coffee & Networking"));
            fireEvent.pointerDown(container.querySelector(".grid__gutter"));

            expect(screen.queryByRole("dialog")).toBeNull();
        });

        it("stays open for a press inside it", () => {
            renderWeek({ events: [tuesday()] });

            fireEvent.click(eventButton("Coffee & Networking"));
            fireEvent.pointerDown(screen.getByRole("dialog"));

            expect(screen.getByRole("dialog")).toBeTruthy();
        });

        it("moves to another event when that one is clicked", () => {
            renderWeek({ events: [tuesday(), sunday()] });

            fireEvent.click(eventButton("Coffee & Networking"));
            fireEvent.pointerDown(eventButton("Sunday Brunch"));
            fireEvent.click(eventButton("Sunday Brunch"));

            expect(screen.getAllByRole("dialog")).toHaveLength(1);
            expect(screen.getByRole("dialog", { name: "Sunday Brunch" }).classList).toContain("popover--right");
        });

        it("goes to the day view from the popover", () => {
            const { onSelectDay } = renderWeek({ events: [tuesday()] });

            fireEvent.click(eventButton("Coffee & Networking"));
            fireEvent.click(screen.getByRole("button", { name: "View day" }));

            expect(onSelectDay).toHaveBeenCalledTimes(1);
            expect(onSelectDay.mock.calls[0][0].toISOString().slice(0, 10)).toBe("2026-10-20");
            expect(screen.queryByRole("dialog")).toBeNull();
        });

        it("closes when the week changes under it", () => {
            const { rerender } = renderWeek({ events: [tuesday()] });

            fireEvent.click(eventButton("Coffee & Networking"));
            rerender(
                <WeekView anchor={new Date("2026-10-27T20:00:00.000Z")} events={[tuesday()]} onSelectDay={vi.fn()} />,
            );

            expect(screen.queryByRole("dialog")).toBeNull();

            // And it does not come back on stepping back to the week it opened in.
            rerender(<WeekView anchor={anchor()} events={[tuesday()]} onSelectDay={vi.fn()} />);

            expect(screen.queryByRole("dialog")).toBeNull();
        });
    });
});

describe("WeekView on a phone", () => {
    // Overlapping events split a ~40px column, under the 24px minimum target
    // (2.5.8), so there the day's column is the target instead.
    const phone = () => {
        window.matchMedia = (query) => ({
            matches: query === "(max-width: 900px)",
            media: query,
            addEventListener() {},
            removeEventListener() {},
        });
    };
    afterEach(() => {
        delete window.matchMedia;
    });

    const overlapping = [
        timed(1, "Coffee & Networking", "2026-10-20T17:00:00.000Z", "2026-10-20T18:30:00.000Z"),
        timed(2, "Design Workshop", "2026-10-20T17:30:00.000Z", "2026-10-20T19:00:00.000Z"),
    ];

    it("goes to the day for a press anywhere in its column", () => {
        phone();
        const { container, onSelectDay } = renderWeek({ events: overlapping });

        // Tuesday the 20th, the third column.
        fireEvent.click(container.querySelectorAll(".grid__col")[2]);

        expect(onSelectDay).toHaveBeenCalledTimes(1);
        expect(onSelectDay.mock.calls[0][0].toISOString().slice(0, 10)).toBe("2026-10-20");
        expect(container.querySelector(".grid").classList).toContain("grid--tap-days");
    });

    it("keeps every event a button, so a keyboard or screen reader still opens it", () => {
        phone();
        renderWeek({ events: overlapping });

        const event = screen.getByRole("button", { name: /Design Workshop/ });
        expect(event.getAttribute("aria-haspopup")).toBe("dialog");
        fireEvent.keyDown(event, { key: "Enter" });
        fireEvent.click(event);
        expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("adds no tab stop for the columns: the day header is the keyboard way to the day", () => {
        phone();
        const { container } = renderWeek({ events: overlapping });

        for (const column of container.querySelectorAll(".grid__col")) {
            expect(column.hasAttribute("tabindex")).toBe(false);
            expect(column.getAttribute("role")).toBeNull();
        }
    });

    it("leaves the columns alone on a wide screen, where events are wide enough", () => {
        const { container, onSelectDay } = renderWeek({ events: overlapping });

        fireEvent.click(container.querySelectorAll(".grid__col")[2]);

        expect(onSelectDay).not.toHaveBeenCalled();
        expect(container.querySelector(".grid").classList).not.toContain("grid--tap-days");
    });
});
