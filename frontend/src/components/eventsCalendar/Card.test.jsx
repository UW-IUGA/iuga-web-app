import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildMonthGrid, colorForLabels, normalizeEvent, zonedParts } from "../../utils/calendar/calendar";
import Card from "./Card";

// Flat index of a day cell inside the 6x7 grid, mirroring buildMonthGrid.
function dayIndex(year, month, day) {
    return new Date(Date.UTC(year, month, 1)).getUTCDay() + day - 1;
}

const panel = () =>
    normalizeEvent({
        eId: "panel",
        eName: "Industry Panel",
        eStartDate: "2026-10-22T17:00:00Z",
        eEndDate: "2026-10-22T19:00:00Z",
        eLabels: ["Career"],
    });

function renderCard({ rows } = {}) {
    const onPickDay = vi.fn();
    const view = render(
        <Card title="October 2026" rows={rows ?? buildMonthGrid(2026, 9, [panel()])} onPickDay={onPickDay} />,
    );

    return { ...view, onPickDay };
}

const padAt = (container, index) => container.querySelectorAll(".pad")[index];
// The full-size day's own button, which fills the cell behind its chips.
const openAt = (container, index) => padAt(container, index).querySelector(".pad__open");

afterEach(cleanup);

describe("Card", () => {
    it("renders a six by seven grid of days", () => {
        const { container } = renderCard();

        expect(container.querySelectorAll(".row")).toHaveLength(7); // header + 6 weeks
        expect(container.querySelectorAll(".pad")).toHaveLength(42);
    });

    it("names the month", () => {
        renderCard();

        expect(screen.getByText("October 2026")).toBeTruthy();
    });

    it("shows an event as a labelled chip on its day", () => {
        const { container } = renderCard();
        const cell = padAt(container, dayIndex(2026, 9, 22));

        expect(cell.querySelector(".pad__event").textContent).toBe("Industry Panel");
    });

    it("leaves days without events bare", () => {
        const { container } = renderCard();

        expect(padAt(container, dayIndex(2026, 9, 22)).querySelectorAll(".pad__event")).toHaveLength(1);
        expect(padAt(container, dayIndex(2026, 9, 23)).querySelectorAll(".pad__event")).toHaveLength(0);
    });

    it("caps the chips and counts the rest", () => {
        const many = Array.from({ length: 5 }, (_, index) =>
            normalizeEvent({
                eId: `e${index}`,
                eName: `Event ${index}`,
                eStartDate: "2026-10-22T17:00:00Z",
                eEndDate: "2026-10-22T18:00:00Z",
            }),
        );
        const { container } = renderCard({ rows: buildMonthGrid(2026, 9, many) });
        const cell = padAt(container, dayIndex(2026, 9, 22));

        expect(cell.querySelectorAll(".pad__event")).toHaveLength(3);
        expect(cell.querySelector(".pad__more").textContent).toBe("+2 more");
    });

    it("dims the days spilling in from adjacent months", () => {
        const { container } = renderCard();

        expect(container.querySelectorAll(".pad--out").length).toBeGreaterThan(0);
    });

    it("asks to open the day view when a pad is clicked", () => {
        const { container, onPickDay } = renderCard();

        fireEvent.click(openAt(container, dayIndex(2026, 9, 22)));

        expect(onPickDay).toHaveBeenCalledTimes(1);
        expect(zonedParts(onPickDay.mock.calls[0][0])).toMatchObject({
            year: 2026,
            month: 9,
            day: 22,
            hour: 0,
        });
    });

    it("lets an adjacent-month day be clicked through to its real date", () => {
        const { container, onPickDay } = renderCard();

        // Flat index 0 is Sun Sep 27 2026.
        fireEvent.click(openAt(container, 0));

        expect(zonedParts(onPickDay.mock.calls[0][0])).toMatchObject({ month: 8, day: 27 });
    });

    describe("compact", () => {
        it("drops the event chips a full card would show", () => {
            const { container } = render(
                <Card title="October 2026" rows={buildMonthGrid(2026, 9, [panel()])} onPickDay={vi.fn()} compact />,
            );

            expect(container.querySelector(".pad__event")).toBeNull();
            expect(container.querySelector(".pad__more")).toBeNull();
        });

        it("flags days with events instead of naming them", () => {
            const { container } = render(
                <Card title="October 2026" rows={buildMonthGrid(2026, 9, [panel()])} onPickDay={vi.fn()} compact />,
            );

            const flagged = padAt(container, dayIndex(2026, 9, 22));
            expect(flagged.classList.contains("pad--event")).toBe(true);
            expect(padAt(container, dayIndex(2026, 9, 23)).classList.contains("pad--event")).toBe(false);
        });

        it("paints the pad with the first event label colour", () => {
            const { container } = render(
                <Card title="October 2026" rows={buildMonthGrid(2026, 9, [panel()])} onPickDay={vi.fn()} compact />,
            );

            // panel() carries the Career label, in its colour.
            const cell = padAt(container, dayIndex(2026, 9, 22));
            expect(cell.style.backgroundColor).toBe(colorForLabels(["Career"]));
        });

        it("leaves an event-free day unpainted", () => {
            const { container } = render(
                <Card title="October 2026" rows={buildMonthGrid(2026, 9, [panel()])} onPickDay={vi.fn()} compact />,
            );

            expect(padAt(container, dayIndex(2026, 9, 23)).style.backgroundColor).toBe("");
        });

        it("paints from the first event when a day holds several", () => {
            const day = [
                normalizeEvent({
                    eId: "social",
                    eName: "Social first",
                    eStartDate: "2026-10-22T17:00:00Z",
                    eEndDate: "2026-10-22T18:00:00Z",
                    eLabels: ["Social"],
                }),
                normalizeEvent({
                    eId: "career",
                    eName: "Career second",
                    eStartDate: "2026-10-22T19:00:00Z",
                    eEndDate: "2026-10-22T20:00:00Z",
                    eLabels: ["Career"],
                }),
            ];
            const { container } = render(
                <Card title="October 2026" rows={buildMonthGrid(2026, 9, day)} onPickDay={vi.fn()} compact />,
            );

            const cell = padAt(container, dayIndex(2026, 9, 22));
            expect(cell.style.backgroundColor).toBe(colorForLabels(["Social"]));
        });

        it("is still navigable and still announces its event count", () => {
            const onPickDay = vi.fn();
            const { container } = render(
                <Card title="October 2026" rows={buildMonthGrid(2026, 9, [panel()])} onPickDay={onPickDay} compact />,
            );

            const cell = padAt(container, dayIndex(2026, 9, 22));
            expect(cell.getAttribute("aria-label")).toBe("Thursday, October 22, 1 event");

            fireEvent.click(cell);
            expect(onPickDay).toHaveBeenCalledTimes(1);
        });
    });

    describe("days spilling in from adjacent months", () => {
        it("prints no day number, since 0 and negatives are not dates", () => {
            const { container } = renderCard();

            for (const cell of container.querySelectorAll(".pad--out")) {
                expect(cell.querySelector(".pad__day")).toBeNull();
            }
        });

        it("renders no zero or negative number anywhere in the grid", () => {
            const { container } = renderCard();

            const labels = [...container.querySelectorAll(".pad__day")].map((node) => node.textContent);
            expect(labels.some((label) => Number(label) <= 0)).toBe(false);
            expect(labels.some((label) => label.startsWith("-"))).toBe(false);
        });

        it("labels a spill cell without inventing a day that does not exist", () => {
            const { container } = renderCard();

            const spill = container.querySelector(".pad--out .pad__open");
            expect(spill.getAttribute("aria-label")).not.toMatch(/^0,|^-/);
            // Flat index 0 is Sun Sep 27: named as the real day it opens.
            expect(spill.getAttribute("aria-label")).toBe("Sunday, September 27, no events");
        });

        it("keeps a spill cell clickable through to its real date", () => {
            const { container, onPickDay } = renderCard();

            expect(container.querySelectorAll(".pad--out").length).toBeGreaterThan(0);

            fireEvent.click(openAt(container, 0));
            expect(onPickDay).toHaveBeenCalledTimes(1);
        });
    });

    describe("today", () => {
        // Pinned inside October 2026, so the test does not depend on the real date.
        const onOct22 = (run) => {
            vi.useFakeTimers({ now: new Date("2026-10-22T19:00:00Z"), toFake: ["Date"] });
            try {
                run();
            } finally {
                vi.useRealTimers();
            }
        };

        it("circles today, and only today, in the month view", () => {
            onOct22(() => {
                const { container } = renderCard();

                const today = container.querySelectorAll(".pad--today");
                expect(today).toHaveLength(1);
                expect(today[0]).toBe(padAt(container, dayIndex(2026, 9, 22)));
                expect(today[0].querySelector(".pad__day").textContent).toBe("22");
            });
        });

        it("tells a screen reader which day is today", () => {
            onOct22(() => {
                const { container } = renderCard();

                const open = openAt(container, dayIndex(2026, 9, 22));
                expect(open.getAttribute("aria-current")).toBe("date");
                expect(open.getAttribute("aria-label")).toBe("Thursday, October 22, today, 1 event");
                expect(container.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
            });
        });

        it("marks nothing when today is in another month", () => {
            vi.useFakeTimers({ now: new Date("2027-03-10T19:00:00Z"), toFake: ["Date"] });
            try {
                const { container } = renderCard();

                expect(container.querySelector(".pad--today")).toBeNull();
                expect(container.querySelector('[aria-current="date"]')).toBeNull();
            } finally {
                vi.useRealTimers();
            }
        });

        it("leaves the year view's compact squares uncircled", () => {
            onOct22(() => {
                const { container } = render(
                    <Card title="October 2026" rows={buildMonthGrid(2026, 9, [panel()])} onPickDay={vi.fn()} compact />,
                );

                expect(container.querySelector(".pad--today")).toBeNull();
            });
        });
    });
});
