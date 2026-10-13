import {
    classifyEvents,
    displayLabel,
    eventsForCategory,
    streamHeading,
} from "./eventStreams";

const makeEvent = (overrides = {}) => ({
    eId: Math.random().toString(36).slice(2),
    eName: "Event",
    eStartDate: "2024-03-01T00:00:00.000Z",
    eLabels: ["Social"],
    ...overrides,
});

describe("displayLabel", () => {
    test("maps the legacy Career label to Professional", () => {
        expect(displayLabel("Career")).toBe("Professional");
    });

    test("leaves other labels unchanged", () => {
        expect(displayLabel("Academic")).toBe("Academic");
        expect(displayLabel("Social")).toBe("Social");
    });
});

describe("eventsForCategory", () => {
    const events = [
        makeEvent({ eId: "academic", eLabels: ["Academic"] }),
        makeEvent({ eId: "social", eLabels: ["Social"] }),
        makeEvent({ eId: "career", eLabels: ["Career"] }),
        makeEvent({ eId: "academic-social", eLabels: ["Academic", "Social"] }),
        makeEvent({ eId: "professional", eLabels: ["Professional"] }),
    ];

    test("returns only events for the requested category", () => {
        const academic = eventsForCategory(events, "Academic").map((e) => e.eId);
        const social = eventsForCategory(events, "Social").map((e) => e.eId);
        expect(academic).toEqual(["academic", "academic-social"]);
        expect(social).toEqual(["social", "academic-social"]);
    });

    test("includes Career-labeled events in the Professional stream", () => {
        const professional = eventsForCategory(events, "Professional").map((e) => e.eId);
        expect(professional).toEqual(["career", "professional"]);
    });

    test("does not mutate the input events", () => {
        const snapshot = JSON.stringify(events);
        eventsForCategory(events, "Social");
        expect(JSON.stringify(events)).toBe(snapshot);
    });
});

describe("classifyEvents", () => {
    const NOW = Date.parse("2024-03-01T00:00:00.000Z");

    test("treats an event starting exactly at now as upcoming", () => {
        const events = [makeEvent({ eId: "boundary", eStartDate: "2024-03-01T00:00:00.000Z" })];
        expect(classifyEvents(events, NOW).mode).toBe("upcoming");
    });

    test("sorts future events soonest-first", () => {
        const events = [
            makeEvent({ eId: "later", eStartDate: "2024-05-01T00:00:00.000Z" }),
            makeEvent({ eId: "sooner", eStartDate: "2024-04-01T00:00:00.000Z" }),
        ];
        const { mode, events: result } = classifyEvents(events, NOW);
        expect(mode).toBe("upcoming");
        expect(result.map((e) => e.eId)).toEqual(["sooner", "later"]);
    });

    test("falls back to past events newest-first when no future events exist", () => {
        const events = [
            makeEvent({ eId: "older", eStartDate: "2024-01-01T00:00:00.000Z" }),
            makeEvent({ eId: "newer", eStartDate: "2024-02-01T00:00:00.000Z" }),
        ];
        const { mode, events: result } = classifyEvents(events, NOW);
        expect(mode).toBe("latest");
        expect(result.map((e) => e.eId)).toEqual(["newer", "older"]);
    });

    test("never mixes past events into an upcoming list", () => {
        const events = [
            makeEvent({ eId: "past", eStartDate: "2024-01-01T00:00:00.000Z" }),
            makeEvent({ eId: "future", eStartDate: "2024-04-01T00:00:00.000Z" }),
        ];
        const { mode, events: result } = classifyEvents(events, NOW);
        expect(mode).toBe("upcoming");
        expect(result.map((e) => e.eId)).toEqual(["future"]);
    });

    test("reports the empty mode for an empty collection", () => {
        expect(classifyEvents([], NOW)).toEqual({ mode: "empty", events: [] });
    });

    test("does not mutate the input events", () => {
        const events = [
            makeEvent({ eId: "a", eStartDate: "2024-04-01T00:00:00.000Z" }),
            makeEvent({ eId: "b", eStartDate: "2024-01-01T00:00:00.000Z" }),
        ];
        const snapshot = JSON.stringify(events);
        classifyEvents(events, NOW);
        expect(JSON.stringify(events)).toBe(snapshot);
    });
});

describe("streamHeading", () => {
    test("returns the approved headings for each mode", () => {
        expect(streamHeading("upcoming")).toBe("UPCOMING EVENTS");
        expect(streamHeading("latest")).toBe("LATEST EVENTS");
        expect(streamHeading("empty")).toBe("EVENTS");
    });
});
