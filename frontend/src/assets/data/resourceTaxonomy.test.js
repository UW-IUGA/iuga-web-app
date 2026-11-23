import { allTags, labelsOf, tagGroups } from "./resourceTaxonomy";

const groupTags = (label) => tagGroups.find((group) => group.label === label).tags;

describe("resource tags", () => {
    test("offers Entrepreneurship as an interest and Social, not Community, as support", () => {
        expect(groupTags("Interests")).toContain("Entrepreneurship");
        expect(groupTags("Support")).toContain("Social");
        expect(allTags).not.toContain("Community");
    });

    test("labels a resource with its type, then its tags", () => {
        expect(labelsOf({ type: "RSO", tags: ["Social", "Projects"] })).toEqual(["RSO", "Social", "Projects"]);
    });
});
