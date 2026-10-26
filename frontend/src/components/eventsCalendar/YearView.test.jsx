import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { zonedParts } from "../../utils/calendar/calendar";
import YearView from "./YearView";

// Tweens finish the moment they start, so the open and close sequences run to
// completion synchronously and the tests can assert on where they end up.
// Each tween and set is recorded, so a test can check what the pad was told
// to animate to.
const tweens = vi.hoisted(() => []);

vi.mock("gsap", () => {
    const run = (vars = {}) => {
        vars.onStart?.();
        vars.onComplete?.();
    };
    return {
        gsap: {
            to: (target, vars) => {
                tweens.push({ kind: "to", target, vars });
                run(vars);
            },
            fromTo: (_target, _from, vars) => run(vars),
            set: (target, vars) => tweens.push({ kind: "set", target, vars }),
            killTweensOf: () => {},
            utils: { random: () => 0 },
        },
    };
});

// Raw wire events, the shape groupByMonth expects. Spread across years on
// purpose: the year view is the whole archive, not one year of it.
const rawEvents = [
    {
        eId: "oct-a",
        eName: "Industry Panel",
        eStartDate: "2026-10-22T17:00:00Z",
        eEndDate: "2026-10-22T19:00:00Z",
        eLabels: ["Career"],
    },
    {
        eId: "oct-b",
        eName: "Fall Social",
        eStartDate: "2026-10-24T19:00:00Z",
        eEndDate: "2026-10-24T22:00:00Z",
        eLabels: ["Social"],
    },
    {
        eId: "apr-2026",
        eName: "Spring Meetup",
        eStartDate: "2026-04-08T17:00:00Z",
        eEndDate: "2026-04-08T19:00:00Z",
    },
    {
        eId: "apr-2024",
        eName: "Legacy Panel",
        eStartDate: "2024-04-08T17:00:00Z",
        eEndDate: "2024-04-08T19:00:00Z",
    },
];

function renderYear(props = {}) {
    const onPickDay = vi.fn();
    const view = render(<YearView rawEvents={rawEvents} onPickDay={onPickDay} {...props} />);

    return { ...view, onPickDay };
}

// The visible title only. The current month's heading also carries a
// screen-reader-only ", this month", which the real clock decides.
const titles = (container) =>
    [...container.querySelectorAll(".card-title__heading")].map((node) => node.firstChild.textContent);

// Pins "now" while `run` renders, so which month is current is up to the test.
function at(iso, run) {
    vi.useFakeTimers({ now: new Date(iso), toFake: ["Date"] });
    try {
        return run();
    } finally {
        vi.useRealTimers();
    }
}

afterEach(cleanup);

describe("YearView", () => {
    it("shows a card for every month that has events, across every year", () => {
        const { container } = renderYear();

        expect(titles(container)).toEqual(["October 2026", "April 2026", "April 2024"]);
    });

    it("ignores the anchor entirely — there is no anchor prop", () => {
        const { container } = renderYear({ anchor: new Date("1999-01-01T20:00:00.000Z") });

        // Same archive as without it.
        expect(titles(container)).toEqual(["October 2026", "April 2026", "April 2024"]);
    });

    it("omits the event chips that need a full-width card", () => {
        const { container } = renderYear();

        expect(container.querySelector(".pad__event")).toBeNull();
        expect(container.querySelector(".pad__events")).toBeNull();
    });

    it("still marks the days that have events", () => {
        const { container } = renderYear();

        expect(container.querySelectorAll(".pad--event").length).toBeGreaterThan(0);
        expect(container.querySelectorAll(".pad")).toHaveLength(126); // 3 cards x 42
    });

    it("paints every event day with a label colour", () => {
        const { container } = renderYear();

        const flagged = [...container.querySelectorAll(".pad--event")];
        expect(flagged.length).toBeGreaterThan(0);
        expect(flagged.every((pad) => pad.style.backgroundColor !== "")).toBe(true);
    });

    it("leaves days without events unpainted", () => {
        const { container } = renderYear();

        const plain = [...container.querySelectorAll(".pad:not(.pad--event)")];
        expect(plain.every((pad) => pad.style.backgroundColor === "")).toBe(true);
    });

    it("never prints a zero or negative day number in any card", () => {
        const { container } = renderYear();

        const labels = [...container.querySelectorAll(".pad__day")].map((n) => n.textContent);
        expect(labels.length).toBeGreaterThan(0);
        expect(labels.some((label) => Number(label) <= 0)).toBe(false);
        expect(labels.some((label) => label.startsWith("-"))).toBe(false);
    });

    it("leaves spill cells bare across every card", () => {
        const { container } = renderYear();

        for (const cell of container.querySelectorAll(".pad--out")) {
            expect(cell.querySelector(".pad__day")).toBeNull();
        }
    });

    // October 2026 is the first card. The 22nd holds the Industry Panel.
    const panelPad = (container) =>
        within(container.querySelectorAll(".card")[0]).getByRole("button", {
            name: "Thursday, October 22, 1 event",
        });

    it("opens a day in place when an event pad is clicked", () => {
        const { container, onPickDay } = renderYear();

        fireEvent.click(panelPad(container));

        const dialog = screen.getByRole("dialog", { name: "Thursday, October 22, 2026" });
        expect(within(dialog).getByText("Industry Panel")).toBeTruthy();
        expect(container.querySelectorAll(".card")[0].classList).toContain("card--open");
        // Opening is not navigating.
        expect(onPickDay).not.toHaveBeenCalled();
    });

    it("moves focus into the open day and takes the grid out of reach", () => {
        const { container } = renderYear();

        fireEvent.click(panelPad(container));

        expect(document.activeElement).toBe(screen.getByRole("button", { name: "Back" }));
        expect(container.querySelector(".card .card-grid").hasAttribute("inert")).toBe(true);
    });

    it("closes on Back and hands focus back to the pad", () => {
        const { container } = renderYear();
        const pad = panelPad(container);

        fireEvent.click(pad);
        fireEvent.click(screen.getByRole("button", { name: "Back" }));

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(pad);
    });

    it("closes on Escape", () => {
        const { container } = renderYear();
        const pad = panelPad(container);

        fireEvent.click(pad);
        fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

        expect(screen.queryByRole("dialog")).toBeNull();
        expect(document.activeElement).toBe(pad);
    });

    it("goes to the day view from the open day", () => {
        const { container, onPickDay } = renderYear();

        fireEvent.click(panelPad(container));
        fireEvent.click(screen.getByRole("button", { name: "View day" }));

        expect(onPickDay).toHaveBeenCalledTimes(1);
        expect(zonedParts(onPickDay.mock.calls[0][0])).toMatchObject({
            year: 2026,
            month: 9,
            day: 22,
        });
    });

    it("squares the pad off as it grows, so it fills the card to its corners", () => {
        const { container } = renderYear();
        const pad = panelPad(container);
        tweens.length = 0;

        fireEvent.click(pad);

        const grow = tweens.find((t) => t.kind === "to" && t.target === pad);
        expect(grow.vars.scale).toBeGreaterThan(1);
        // A rounded pad, scaled up, rounds its corners far past the card's own.
        expect(grow.vars.borderRadius).toBe(0);
    });

    it("gives the pad its corners back as it shrinks, then hands them to the stylesheet", () => {
        const { container } = renderYear();
        const pad = panelPad(container);

        fireEvent.click(pad);
        tweens.length = 0;
        fireEvent.click(screen.getByRole("button", { name: "Back" }));

        const shrink = tweens.find((t) => t.kind === "to" && t.target === pad);
        expect(shrink.vars.scale).toBe(1);
        expect(shrink.vars.borderRadius).toBe(getComputedStyle(pad).borderRadius);
        expect(tweens.some((t) => t.kind === "set" && t.target === pad && t.vars.clearProps === "borderRadius")).toBe(
            true,
        );
    });

    it("leaves days without events inert", () => {
        const { container } = renderYear();

        const plain = [...container.querySelectorAll(".pad:not(.pad--event)")];
        expect(plain.every((pad) => pad.disabled)).toBe(true);

        fireEvent.click(plain[0]);
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("outlines the card for the month that holds today, and only that one", () => {
        at("2026-10-21T19:00:00Z", () => {
            const { container } = renderYear();

            const current = [...container.querySelectorAll(".card--current")];
            expect(current).toHaveLength(1);
            expect(current[0].querySelector(".card-title__heading").firstChild.textContent).toBe("October 2026");
        });
    });

    it("tells a screen reader which month is this month", () => {
        at("2026-10-21T19:00:00Z", () => {
            const { container } = renderYear();

            expect(container.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
            // The test DOM's name computation pads the inline sr-only span with a
            // space a browser does not add, so the comma is matched loosely.
            expect(screen.getByRole("heading", { name: /^October 2026\s?, this month$/ })).toBeTruthy();
            // The other months' headings say nothing extra.
            expect(screen.getByRole("heading", { name: "April 2026" })).toBeTruthy();
        });
    });

    it("outlines the same month in another year only in that year", () => {
        // April 2026 and April 2024 both have cards.
        at("2024-04-15T19:00:00Z", () => {
            const { container } = renderYear();

            const current = container.querySelector(".card--current .card-title__heading");
            expect(current.firstChild.textContent).toBe("April 2024");
            expect(container.querySelectorAll(".card--current")).toHaveLength(1);
        });
    });

    it("outlines nothing when this month has no events, so no card", () => {
        at("2025-07-01T19:00:00Z", () => {
            const { container } = renderYear();

            expect(container.querySelector(".card--current")).toBeNull();
            expect(container.querySelector('[aria-current="date"]')).toBeNull();
        });
    });

    it("renders nothing for an empty data set", () => {
        const { container } = renderYear({ rawEvents: [] });

        expect(container.querySelectorAll(".card")).toHaveLength(0);
        expect(screen.queryByText(/2026/)).toBeNull();
    });
});
