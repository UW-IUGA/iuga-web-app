import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import EventStream from "./EventStream";

// EventCard formats dates with the ESM-only "dateformat" package, which jest
// cannot transform inside node_modules; a factory mock keeps the card's
// rendering path exercised without parsing that module.
vi.mock("dateformat", () => ({ default: () => "Mar 01" }));

const NOW = Date.parse("2024-03-01T00:00:00.000Z");

const makeEvent = (overrides = {}) => ({
    eId: Math.random().toString(36).slice(2),
    eName: "Event",
    eStartDate: "2024-03-01T00:00:00.000Z",
    eOrganizers: "IUGA",
    eDescription: "An event.",
    eLabels: ["Social"],
    ...overrides,
});

const renderStream = (events, category = "Academic") =>
    render(
        <MemoryRouter>
            <EventStream category={category} events={events} now={NOW} />
        </MemoryRouter>
    );

const cardNames = () =>
    screen
        .getAllByRole("link")
        .map((card) => within(card).getByRole("heading", { level: 2 }).textContent);

describe("EventStream", () => {
    test("shows UPCOMING EVENTS with only future events, soonest first", () => {
        const events = [
            makeEvent({ eId: "past", eName: "past", eStartDate: "2024-01-01T00:00:00.000Z", eLabels: ["Academic"] }),
            makeEvent({ eId: "later", eName: "later", eStartDate: "2024-05-01T00:00:00.000Z", eLabels: ["Academic"] }),
            makeEvent({ eId: "sooner", eName: "sooner", eStartDate: "2024-04-01T00:00:00.000Z", eLabels: ["Academic"] }),
        ];
        renderStream(events);
        expect(screen.getByRole("heading", { name: "UPCOMING EVENTS" })).toBeInTheDocument();
        expect(cardNames()).toEqual(["sooner", "later"]);
    });

    test("treats an event starting exactly at now as upcoming", () => {
        const events = [
            makeEvent({ eId: "boundary", eName: "boundary", eStartDate: "2024-03-01T00:00:00.000Z", eLabels: ["Academic"] }),
        ];
        renderStream(events);
        expect(screen.getByRole("heading", { name: "UPCOMING EVENTS" })).toBeInTheDocument();
        expect(cardNames()).toEqual(["boundary"]);
    });

    test("falls back to LATEST EVENTS with only past events, newest first", () => {
        const events = [
            makeEvent({ eId: "older", eName: "older", eStartDate: "2024-01-01T00:00:00.000Z", eLabels: ["Academic"] }),
            makeEvent({ eId: "newer", eName: "newer", eStartDate: "2024-02-01T00:00:00.000Z", eLabels: ["Academic"] }),
        ];
        renderStream(events);
        expect(screen.getByRole("heading", { name: "LATEST EVENTS" })).toBeInTheDocument();
        expect(cardNames()).toEqual(["newer", "older"]);
    });

    test("shows EVENTS with an honest empty state when no events exist for the category", () => {
        renderStream([]);
        expect(screen.getByRole("heading", { name: "EVENTS" })).toBeInTheDocument();
        expect(screen.getByText(/no academic events/i)).toBeInTheDocument();
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    test("shows generic empty copy for an unknown category", () => {
        renderStream([], "Volunteer");
        expect(screen.getByText(/no events are on the calendar/i)).toBeInTheDocument();
    });

    test("shows at most three events", () => {
        const events = Array.from({ length: 5 }, (_, i) =>
            makeEvent({
                eId: `event-${i}`,
                eName: `Event ${i}`,
                eStartDate: `2024-04-0${i + 1}T00:00:00.000Z`,
                eLabels: ["Academic"],
            })
        );
        renderStream(events);
        expect(screen.getAllByRole("link")).toHaveLength(3);
    });

    test("a multi-label event appears in each of its category streams", () => {
        const multi = makeEvent({
            eId: "multi",
            eName: "Multi Label Event",
            eStartDate: "2024-04-01T00:00:00.000Z",
            eLabels: ["Academic", "Social"],
        });
        const first = renderStream([multi], "Academic");
        expect(within(first.container).getByText("Multi Label Event")).toBeInTheDocument();
        const second = renderStream([multi], "Social");
        expect(within(second.container).getByText("Multi Label Event")).toBeInTheDocument();
    });

    test("Career-labeled events render in the Professional stream without the word Career", () => {
        const career = makeEvent({
            eId: "career",
            eName: "Industry Panel",
            eStartDate: "2024-04-01T00:00:00.000Z",
            eLabels: ["Career"],
        });
        renderStream([career], "Professional");
        expect(screen.getByRole("heading", { name: "UPCOMING EVENTS" })).toBeInTheDocument();
        expect(screen.getByText("Industry Panel")).toBeInTheDocument();
        expect(screen.queryByText(/career/i)).not.toBeInTheDocument();
    });

    test("does not mix past events into an upcoming stream", () => {
        const events = [
            makeEvent({ eId: "past", eName: "past", eStartDate: "2024-01-01T00:00:00.000Z", eLabels: ["Academic"] }),
            makeEvent({ eId: "future", eName: "future", eStartDate: "2024-04-01T00:00:00.000Z", eLabels: ["Academic"] }),
        ];
        renderStream(events);
        expect(screen.getByRole("heading", { name: "UPCOMING EVENTS" })).toBeInTheDocument();
        expect(cardNames()).toEqual(["future"]);
    });
});
