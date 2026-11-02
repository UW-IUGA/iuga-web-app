import { primaryCategory } from "./eventCategoryIcons";

describe("primaryCategory", () => {
    test("a Career label is drawn as Career", () => {
        expect(primaryCategory({ eLabels: ["Career"] })).toMatchObject({ name: "Career", className: "career" });
    });

    test("a stored Professional label is drawn as Career", () => {
        expect(primaryCategory({ eLabels: ["Professional"] })).toMatchObject({ name: "Career", className: "career" });
    });

    test("the first public category is the one used when an event has several", () => {
        expect(primaryCategory({ eLabels: ["Social", "Academic"] })).toMatchObject({ name: "Social", className: "social" });
    });

    test("a label that is not a public category is drawn as Academic", () => {
        expect(primaryCategory({ eLabels: ["Workshop"] })).toMatchObject({ name: "Academic", className: "academic" });
    });

    test("a label named like an object property is drawn as Academic", () => {
        expect(primaryCategory({ eLabels: ["constructor"] })).toMatchObject({ name: "Academic", className: "academic" });
    });
});
