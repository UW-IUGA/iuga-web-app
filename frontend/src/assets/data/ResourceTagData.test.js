import { describe, expect, it } from "vitest";
import { resources } from "./ResourcesData";
import { resourceTags } from "./Enum";
import { START_HERE, allTags, extraTags, pickStartHere, tagGroups, tagResources } from "./ResourceTagData";

const taggedResources = tagResources(resources);
const groupTags = (label) => tagGroups.find((group) => group.label === label).tags;

describe("resource bullet highlights", () => {
    it("gives every resource one to three bullets", () => {
        taggedResources.forEach(({ rName, highlights }) => {
            expect(highlights.length, rName).toBeGreaterThanOrEqual(1);
            expect(highlights.length, rName).toBeLessThanOrEqual(3);
        });
    });

    it("writes bullets without colons or semicolons", () => {
        taggedResources
            .flatMap(({ highlights }) => highlights)
            .forEach((text) => expect(text).not.toMatch(/[:;]/));
    });
});

describe("tags", () => {
    it("offers Entrepreneurship as an interest and Social, not Community, as support", () => {
        expect(groupTags("Interests")).toContain("Entrepreneurship");
        expect(groupTags("Support")).toContain("Social");
        expect(allTags).not.toContain("Community");
    });

    it("tags resources listed under Community as Social", () => {
        const [club] = tagResources({ [resourceTags.COMMUNITY]: [{ rName: "Example Club" }] });
        expect(club.tags).toEqual(["RSO", "Social"]);
    });

    it("adds tags given by hand, matching names without their surrounding spaces", () => {
        const [club] = tagResources(
            { [resourceTags.COMMUNITY]: [{ rName: "Example Club " }] },
            { "Example Club": ["Entrepreneurship", "Projects", "Social"] }
        );
        expect(club.tags).toEqual(["RSO", "Social", "Entrepreneurship", "Projects"]);
    });
});

// Typos in extraTags would otherwise be ignored without any sign.
describe("tags added by hand", () => {
    it("names only resources on the page, and only real tags", () => {
        const names = taggedResources.map(({ rName }) => rName.trim());
        Object.entries(extraTags).forEach(([name, tags]) => {
            expect(names, `No resource is named "${name}"`).toContain(name);
            tags.forEach((tag) => expect(allTags, `"${tag}" (for ${name}) is not a tag in tagGroups`).toContain(tag));
        });
    });
});

describe("Start Here", () => {
    it("finds all four picks in the resources, in order", () => {
        expect(pickStartHere(taggedResources).map(({ rName }) => rName.trim())).toEqual(START_HERE);
        expect(START_HERE).toEqual([
            "iSchool Student Services",
            "iSchool Peer Advisors",
            "iSchool Career Services (Canvas)",
            "Husky Health & Well-Being",
        ]);
    });
});
