import { primaryCategory } from "./eventCategoryIcons";

describe("primaryCategory", () => {
    test("a legacy Career label is drawn as Professional", () => {
        expect(primaryCategory({ eLabels: ["Career"] })).toMatchObject({ name: "Professional", className: "professional" });
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
