import { categoriesFor, displayLabel } from "./eventStreams";

describe("displayLabel", () => {
    test("maps the legacy Career label to Professional", () => {
        expect(displayLabel("Career")).toBe("Professional");
    });

    test("leaves a label named like an object property unchanged", () => {
        expect(displayLabel("constructor")).toBe("constructor");
        expect(displayLabel("toString")).toBe("toString");
    });
});

describe("categoriesFor", () => {
    test("returns display categories for an event's labels", () => {
        expect(categoriesFor({ eLabels: ["Career", "Social"] })).toEqual(["Professional", "Social"]);
    });

    test("returns no categories when an event has no labels", () => {
        expect(categoriesFor({})).toEqual([]);
    });
});
