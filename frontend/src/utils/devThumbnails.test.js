import { enrichWithDevThumbnails } from "./devThumbnails";
import { mockCalendarData } from "../assets/mock-data/MockCalendarData";
import { categoriesFor } from "./eventStreams";
import bowling from "../assets/gallery/bowling.jpeg";
import groups from "../assets/gallery/groups.jpg";

const TEST_EVENT_5_ID = "662490263e10daba38e25686";

const makeEvent = (overrides = {}) => ({
    eId: "unmapped-event-id",
    eName: "Event",
    eStartDate: "2024-03-01T00:00:00.000Z",
    eLabels: ["Social"],
    ...overrides,
});

describe("enrichWithDevThumbnails", () => {
    test("maps a known event id to its imported gallery asset", () => {
        const [enriched] = enrichWithDevThumbnails([makeEvent({ eId: TEST_EVENT_5_ID })]);
        expect(enriched.eThumbnailPath).toBe(bowling);
    });

    test("Bowling at UW from the mock calendar gets a real imported thumbnail", () => {
        const event5 = mockCalendarData.find((event) => event.eId === TEST_EVENT_5_ID);
        expect(event5).toBeTruthy();
        const [enriched] = enrichWithDevThumbnails([event5]);
        expect(enriched.eThumbnailPath).toBe(bowling);
    });

    test("prefers the eId mapping over any name fallback", () => {
        const event = makeEvent({ eId: TEST_EVENT_5_ID, eName: "Game Night: Board Games" });
        const [enriched] = enrichWithDevThumbnails([event]);
        expect(enriched.eThumbnailPath).toBe(bowling);
    });

    test("falls back to the mapped name when the eId is missing", () => {
        const [enriched] = enrichWithDevThumbnails([
            makeEvent({ eId: undefined, eName: "Bowling at UW" }),
        ]);
        expect(enriched.eThumbnailPath).toBe(bowling);
    });

    test("falls back to the mapped name when the eId is unknown", () => {
        const [enriched] = enrichWithDevThumbnails([
            makeEvent({ eId: "some-other-id", eName: "Study Jam" }),
        ]);
        expect(enriched.eThumbnailPath).toBe(groups);
    });

    test("maps an eName fallback for the real mock event when its eId is absent", () => {
        const event3 = mockCalendarData.find((event) => event.eName === "Study Jam");
        expect(event3).toBeTruthy();
        const [enriched] = enrichWithDevThumbnails([{ ...event3, eId: undefined }]);
        expect(enriched.eThumbnailPath).toBe(groups);
    });

    test("uses the deterministic gallery fallback for ambiguous names", () => {
        const events = [
            makeEvent({ eId: TEST_EVENT_5_ID, eName: "Bowling at UW" }),
            makeEvent({ eId: "other-id", eName: "Bowling at UW" }),
        ];
        const [known, unknown] = enrichWithDevThumbnails(events);
        expect(known.eThumbnailPath).toBe(bowling);
        expect(unknown.eThumbnailPath).toBeTruthy();
    });

    test("generic duplicate mock names still receive gallery thumbnails", () => {
        const duplicateEvents = mockCalendarData
            .filter((event) => event.eName === "Test Event 0.5")
            .map((event) => ({ ...event, eId: undefined }));
        expect(duplicateEvents.length).toBeGreaterThan(1);
        const enriched = enrichWithDevThumbnails(duplicateEvents);
        enriched.forEach((event) => {
            expect(event.eThumbnailPath).toBeTruthy();
        });
    });

    test("assigns a gallery thumbnail to unmapped events", () => {
        const [enriched] = enrichWithDevThumbnails([makeEvent()]);
        expect(enriched.eThumbnailPath).toBeTruthy();
    });

    test("does not mutate the input events", () => {
        const events = [makeEvent({ eId: TEST_EVENT_5_ID })];
        const snapshot = JSON.stringify(events);
        enrichWithDevThumbnails(events);
        expect(JSON.stringify(events)).toBe(snapshot);
    });

    test("returns a new array of new event objects", () => {
        const events = [makeEvent({ eId: TEST_EVENT_5_ID }), makeEvent()];
        const result = enrichWithDevThumbnails(events);
        expect(result).not.toBe(events);
        result.forEach((event, index) => {
            expect(event).not.toBe(events[index]);
        });
    });

    test("preserves all original event fields", () => {
        const event = makeEvent({ eId: TEST_EVENT_5_ID });
        const { eThumbnailPath, ...rest } = enrichWithDevThumbnails([event])[0];
        expect(eThumbnailPath).toBe(bowling);
        expect(rest).toEqual(event);
    });

    test("every display stream has at least one enriched event", () => {
        const enriched = enrichWithDevThumbnails(mockCalendarData);
        ["Academic", "Social", "Professional"].forEach((category) => {
            const withThumbnail = enriched.some(
                (event) => categoriesFor(event).includes(category) && event.eThumbnailPath
            );
            expect(withThumbnail).toBe(true);
        });
    });

    test("every development event receives a gallery thumbnail", () => {
        const enriched = enrichWithDevThumbnails(mockCalendarData);
        expect(enriched.every((event) => event.eThumbnailPath)).toBe(true);
    });
});
