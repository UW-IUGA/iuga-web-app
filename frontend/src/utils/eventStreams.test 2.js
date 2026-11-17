import { categoriesFor, displayLabel } from "./eventStreams";

describe("displayLabel", () => {
    test("shows a stored Professional label as Career", () => {
        expect(displayLabel("Professional")).toBe("Career");
    });

    test("leaves the Career label as it is", () => {
        expect(displayLabel("Career")).toBe("Career");
    });

    test("leaves a label named like an object property unchanged", () => {
        expect(displayLabel("constructor")).toBe("constructor");
        expect(displayLabel("toString")).toBe("toString");
    });
});

describe("categoriesFor", () => {
    test("returns display categories for an event's labels", () => {
        expect(categoriesFor({ eLabels: ["Professional", "Social"] })).toEqual(["Career", "Social"]);
    });

    test("returns no categories when an event has no labels", () => {
        expect(categoriesFor({})).toEqual([]);
    });
});
