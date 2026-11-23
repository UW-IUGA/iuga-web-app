import { allTags, labelsOf, tagForCategory, tagGroups } from "./resourceTaxonomy";

const groupTags = (label) => tagGroups.find((group) => group.label === label).tags;

describe("resource tags", () => {
    test("sorts resources by who runs them and what they help with", () => {
        expect(groupTags("Who runs it")).toEqual(["Student clubs", "iSchool", "UW"]);
        expect(groupTags("What it helps with")).toEqual(["Academic", "Jobs & internships", "Mental Health", "DEI"]);
        expect(groupTags("Interests")).toContain("Entrepreneurship");
    });

    // Every club is social, so these say nothing on Resources; Events keeps them.
    test("has no Social, Career or Community tag", () => {
        ["Social", "Career", "Community"].forEach((tag) => expect(allTags).not.toContain(tag));
    });

    test("opens each of the original page's categories as a tag", () => {
        expect(Object.values(tagForCategory)).toEqual([
            "Academic", "Jobs & internships", "Student clubs", "Mental Health", "DEI",
        ]);
        Object.values(tagForCategory).forEach((tag) => expect(allTags).toContain(tag));
    });

    test("labels a resource with its type, then its tags", () => {
        expect(labelsOf({ type: "Student clubs", tags: ["Projects"] })).toEqual(["Student clubs", "Projects"]);
    });
});
