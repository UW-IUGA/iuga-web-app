import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import EventAgenda from "./EventAgenda";

// Tuesday of the week of Sunday Oct 11 – Saturday Oct 17, 2026.
const NOW = new Date(2026, 9, 13, 9, 0);

const makeEvent = (overrides = {}) => ({
    eId: "game-night",
    eName: "Game Night",
    eStartDate: new Date(2026, 9, 14, 17, 30).toISOString(),
    eLocation: "MGH 120",
    eOrganizers: "IUGA",
    eLabels: ["Social"],
    ...overrides,
});

const studyJam = makeEvent({
    eId: "study-jam",
    eName: "Study Jam",
    eStartDate: new Date(2026, 9, 15, 12, 30).toISOString(),
    eLabels: ["Academic"],
});

const eventNames = () =>
    within(screen.getByRole("list")).getAllByRole("button").map((row) => within(row).getByText(/Game Night|Study Jam|Bowling/).textContent);

describe("EventAgenda", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => vi.useRealTimers());

    test("lists this week's events in order with their time, place, host, and category", () => {
        render(<EventAgenda events={[studyJam, makeEvent()]} />);

        expect(eventNames()).toEqual(["Game Night", "Study Jam"]);
        const row = screen.getByRole("button", { name: /Game Night, Wednesday, October 14 at 5:30 PM/ });
        expect(within(row).getByText("5:30 PM · MGH 120")).toBeInTheDocument();
        expect(within(row).getByText("Hosted by IUGA")).toBeInTheDocument();
        expect(within(row).getByText("Social")).toBeInTheDocument();
    });

    test("choosing a day shows only that day's events, and choosing it again shows the week", () => {
        render(<EventAgenda events={[makeEvent(), studyJam]} />);
        const thursday = screen.getByRole("button", { name: "Thursday, October 15: 1 event" });

        fireEvent.click(thursday);
        expect(eventNames()).toEqual(["Study Jam"]);

        fireEvent.click(thursday);
        expect(eventNames()).toEqual(["Game Night", "Study Jam"]);
    });

    test("a chosen day that loses its events stops filtering, so the rest of the week shows", () => {
        const { rerender } = render(<EventAgenda events={[makeEvent(), studyJam]} />);
        fireEvent.click(screen.getByRole("button", { name: "Thursday, October 15: 1 event" }));

        rerender(<EventAgenda events={[makeEvent()]} />);

        expect(screen.queryByText("Nothing is scheduled this week.")).not.toBeInTheDocument();
        expect(eventNames()).toEqual(["Game Night"]);
    });

    test("days without events cannot be chosen", () => {
        render(<EventAgenda events={[makeEvent()]} />);

        expect(screen.getByRole("button", { name: "Tuesday, October 13, today: 0 events" })).toBeDisabled();
    });

    test("an empty week offers a jump to the next upcoming event", () => {
        const bowling = makeEvent({
            eId: "bowling",
            eName: "Bowling",
            eStartDate: new Date(2026, 9, 23, 18, 30).toISOString(),
        });
        render(<EventAgenda events={[bowling]} />);

        expect(screen.getByText("Nothing is scheduled this week.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Next event: Fri, Oct 23/ }));

        expect(eventNames()).toEqual(["Bowling"]);
        expect(screen.getByText("Oct 18–24, 2026")).toBeInTheDocument();
    });

    test("an empty week with nothing ahead offers no jump", () => {
        const lastYear = makeEvent({ eStartDate: new Date(2025, 9, 14, 17, 30).toISOString() });
        render(<EventAgenda events={[lastYear]} />);

        expect(screen.getByText("Nothing is scheduled this week.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Next event/ })).not.toBeInTheDocument();
    });

    test("week navigation moves one week at a time", () => {
        render(<EventAgenda events={[makeEvent()]} />);

        fireEvent.click(screen.getByRole("button", { name: /Next week/ }));
        expect(screen.getByText("Oct 18–24, 2026")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Previous week/ }));
        expect(screen.getByText("Oct 11–17, 2026")).toBeInTheDocument();
    });

    test("starts on the week of the initial date when one is given", () => {
        render(<EventAgenda events={[]} initialDate={new Date(2026, 10, 3).toISOString()} />);

        expect(screen.getByText("Nov 1–7, 2026")).toBeInTheDocument();
    });

    test("an event late on Saturday stays in that week and one at midnight Sunday starts the next", () => {
        const saturdayLate = makeEvent({
            eId: "saturday-late",
            eName: "Late Saturday Meetup",
            eStartDate: new Date(2026, 9, 17, 23, 59).toISOString(),
        });
        const sundayMidnight = makeEvent({
            eId: "sunday-midnight",
            eName: "Sunday Midnight Meetup",
            eStartDate: new Date(2026, 9, 18, 0, 0).toISOString(),
        });
        render(<EventAgenda events={[saturdayLate, sundayMidnight]} />);

        expect(screen.getByRole("button", { name: /Late Saturday Meetup, Saturday, October 17 at 11:59 PM/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Sunday Midnight Meetup/ })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Next week/ }));

        expect(screen.getByRole("button", { name: /Sunday Midnight Meetup, Sunday, October 18 at 12:00 AM/ })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Late Saturday Meetup/ })).not.toBeInTheDocument();
    });

    test("an event missing its location and host still lists with fallback text", () => {
        render(<EventAgenda events={[makeEvent({ eLocation: undefined, eOrganizers: undefined, eLabels: undefined })]} />);

        const row = screen.getByRole("button", { name: /Game Night, Wednesday, October 14 at 5:30 PM/ });
        expect(within(row).getByText("5:30 PM · Location to be announced")).toBeInTheDocument();
        expect(within(row).queryByText(/Hosted by/)).not.toBeInTheDocument();
    });
});
