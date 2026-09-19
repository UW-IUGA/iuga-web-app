import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { addDays, startOfWeek } from "date-fns";
import WeeklyCalendar from "./WeeklyCalendar";

const WEEK_START = startOfWeek(new Date(), { weekStartsOn: 0 });

// Builds a deterministic timestamp inside the calendar's displayed week so
// cards render regardless of when the suite runs.
const at = (dayOffset, hour = 12, minute = 0) => {
    const date = addDays(WEEK_START, dayOffset);
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
};

const INITIAL_DATE = WEEK_START.toISOString();

const makeEvent = (overrides = {}) => ({
    eId: Math.random().toString(36).slice(2),
    eName: "Event",
    eStartDate: at(1),
    eLocation: "MGH 120",
    eOrganizers: "IUGA",
    eLabels: ["Social"],
    eHost: null,
    ...overrides,
});

const renderCalendar = (events, props = {}) =>
    render(<WeeklyCalendar events={events} initialDate={INITIAL_DATE} {...props} />);

describe("WeeklyCalendar", () => {
    test("legend lists the three display categories", () => {
        renderCalendar([]);
        const legend = screen.getByLabelText("Event categories");
        expect(within(legend).getByText("Academic")).toBeInTheDocument();
        expect(within(legend).getByText("Social")).toBeInTheDocument();
        expect(within(legend).getByText("Professional")).toBeInTheDocument();
    });

    test("shows an open-day empty state for days without events", () => {
        renderCalendar([]);
        expect(screen.getAllByText("Open day")).toHaveLength(7);
    });
});

describe("WeeklyCalendar event cards", () => {
    test("applies the academic wash class to an Academic event", () => {
        const event = makeEvent({ eName: "Study Jam", eLabels: ["Academic"] });
        renderCalendar([event]);
        const card = screen.getByRole("button", { name: /Study Jam/ });
        expect(card).toHaveClass("weeklyEvent-academic");
        expect(within(card).getAllByText("Academic").length).toBeGreaterThan(0);
    });

    test("applies the social wash class to a Social event", () => {
        const event = makeEvent({ eName: "Game Night", eLabels: ["Social"] });
        renderCalendar([event]);
        expect(screen.getByRole("button", { name: /Game Night/ })).toHaveClass("weeklyEvent-social");
    });

    test("maps Career labels to the Professional wash and label without the word Career", () => {
        const event = makeEvent({ eName: "Industry Panel", eLabels: ["Career"] });
        renderCalendar([event]);
        const card = screen.getByRole("button", { name: /Industry Panel/ });
        expect(card).toHaveClass("weeklyEvent-professional");
        expect(within(card).getAllByText("Professional").length).toBeGreaterThan(0);
        expect(within(card).queryByText(/career/i)).not.toBeInTheDocument();
    });

    test("uses the first label for the wash and renders every category capsule", () => {
        const event = makeEvent({
            eName: "Bowling Night",
            eLabels: ["Social", "Academic", "Career"],
        });
        renderCalendar([event]);
        const card = screen.getByRole("button", { name: /Bowling Night/ });
        expect(card).toHaveClass("weeklyEvent-social");
        expect(within(card).getAllByText("Social").length).toBeGreaterThan(0);
        expect(within(card).getByText("Academic")).toBeInTheDocument();
        expect(within(card).getByText("Professional")).toBeInTheDocument();
    });

    test("renders time and location inside pill badges", () => {
        const event = makeEvent({ eName: "Study Jam", eStartDate: at(1, 12, 0) });
        renderCalendar([event]);
        const card = screen.getByRole("button", { name: /Study Jam/ });
        expect(within(card).getByText("12:00 PM")).toHaveClass("weeklyEventPill");
        expect(within(card).getByText("MGH 120")).toHaveClass("weeklyEventPill");
    });

    test("omits the location pill for events without a location", () => {
        const event = makeEvent({ eName: "Study Jam", eLocation: null });
        renderCalendar([event]);
        const card = screen.getByRole("button", { name: /Study Jam/ });
        expect(within(card).queryByText("MGH 120")).not.toBeInTheDocument();
    });

    test("shows the host avatar photo when the host resolves in the officer directory", () => {
        const event = makeEvent({ eName: "Study Jam", eHost: { name: "Yonie Rivera", userId: "u1" } });
        renderCalendar([event]);
        const card = screen.getByRole("button", { name: /Study Jam/ });
        expect(within(card).getByRole("img")).toHaveAttribute("alt", "");
        expect(within(card).getByText("Yonie Rivera")).toBeInTheDocument();
    });

    test("falls back to host initials when the host is not in the officer directory", () => {
        const event = makeEvent({ eName: "Bowling Night", eHost: { name: "Alex Chen", userId: "u2" } });
        renderCalendar([event]);
        const card = screen.getByRole("button", { name: /Bowling Night/ });
        expect(within(card).queryByRole("img")).not.toBeInTheDocument();
        expect(within(card).getByText("AC")).toBeInTheDocument();
        expect(within(card).getByText("Alex Chen")).toBeInTheDocument();
    });

    test("renders no host badge when the event has no host", () => {
        const event = makeEvent({ eName: "Game Night" });
        renderCalendar([event]);
        const card = screen.getByRole("button", { name: /Game Night/ });
        expect(within(card).queryByRole("img")).not.toBeInTheDocument();
        expect(within(card).queryByText(/hosted by/i)).not.toBeInTheDocument();
    });

    test("builds an accessible label with event, day, time, location, and host", () => {
        const event = makeEvent({
            eName: "Study Jam",
            eStartDate: at(2, 18, 30),
            eLocation: "MGH 122",
            eHost: { name: "Dia Dora", userId: "u3" },
        });
        renderCalendar([event]);
        const card = screen.getByRole("button", { name: /Study Jam/ });
        expect(card).toHaveAccessibleName(/Study Jam/i);
        expect(card).toHaveAccessibleName(/at 6:30 PM/i);
        expect(card).toHaveAccessibleName(/MGH 122/i);
        expect(card).toHaveAccessibleName(/hosted by Dia Dora/i);
    });

    test("selects the event when a card is clicked", () => {
        const onSelectEvent = vi.fn();
        const event = makeEvent({ eName: "Study Jam" });
        renderCalendar([event], { onSelectEvent });
        screen.getByRole("button", { name: /Study Jam/ }).click();
        expect(onSelectEvent).toHaveBeenCalledWith(event);
    });
});