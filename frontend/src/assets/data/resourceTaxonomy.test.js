import { allTags, labelsOf, offerings, sectionsOf, tagForCategory, tagGroups } from "./resourceTaxonomy";

const groupTags = (label) => tagGroups.find((group) => group.label === label).tags;

describe("resource tags", () => {
    test("sorts resources by who runs them and what they help with", () => {
        expect(groupTags("Who runs it")).toEqual(["Student clubs", "iSchool", "UW"]);
        expect(groupTags("What it helps with")).toEqual(["Academic", "Jobs & internships", "Mental Health", "DEI"]);
    });

    test("files clubs under Abe's seven club areas, in his order", () => {
        expect(groupTags("Club area")).toEqual([
            "iOrgs", "PM/Consulting", "Entrepreneurship", "Software Engineering", "DS/ML", "UI/UX", "Cybersecurity",
        ]);
        expect(tagGroups.map(({ label }) => label)).toEqual(["Who runs it", "What it helps with", "Club area"]);
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

    test("lists support, then each club area (with any iSchool or UW group in it), then any club without an area", () => {
        const uw = { rName: "Health", type: "UW", tags: [] };
        const ux = { rName: "UX Club", type: "Student clubs", tags: ["UI/UX"] };
        const orgs = { rName: "Org", type: "Student clubs", tags: ["iOrgs"] };
        const loose = { rName: "New Club", type: "Student clubs", tags: [] };
        const lab = { rName: "Startup Lab", type: "iSchool", tags: ["Entrepreneurship"] };

        expect(sectionsOf([ux, loose, lab, uw, orgs])).toEqual([
            { heading: "Support", resources: [uw] },
            { heading: "iOrgs", resources: [orgs] },
            { heading: "Entrepreneurship", resources: [lab] },
            { heading: "UI/UX", resources: [ux] },
            { heading: "More clubs", resources: [loose] },
        ]);
    });

    test("names four things a club can offer, none of them a filter", () => {
        expect(offerings).toEqual(["Project teams", "Hackathon", "Competition", "Career panels"]);
        offerings.forEach((offer) => expect(allTags).not.toContain(offer));
    });

    test("labels a resource with its type, then its tags", () => {
        expect(labelsOf({ type: "Student clubs", tags: ["Projects"] })).toEqual(["Student clubs", "Projects"]);
    });
});
