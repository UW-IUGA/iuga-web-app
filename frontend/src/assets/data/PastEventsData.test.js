import { pastEvents } from "./PastEventsData";

describe("pastEvents", () => {
    test("every event has what its card and photo viewer show", () => {
        expect(pastEvents.length).toBeGreaterThan(0);
        pastEvents.forEach((event) => {
            expect(event.id).toBeTruthy();
            expect(event.name).toBeTruthy();
            expect(event.when).toBeTruthy();
            expect(event.summary).toBeTruthy();
            expect(event.photos.length).toBeGreaterThan(0);
        });
    });

    test("every photo has a full-size file, a small file, and alt text", () => {
        pastEvents.flatMap((event) => event.photos).forEach((photo) => {
            expect(photo.src).toMatch(/\.webp$/);
            expect(photo.thumbnail).toMatch(/-small\.webp$/);
            expect(photo.alt).toBeTruthy();
        });
    });
});
