import { resources } from "./ResourcesData";
import { allTags, tagGroups } from "./resourceTaxonomy";

const typeTags = tagGroups.find((group) => group.label === "Who runs it").tags;

describe("resource records", () => {
    test("gives every resource one to three summary bullets", () => {
        resources.forEach(({ rName, summary }) => {
            expect(summary.length, rName).toBeGreaterThanOrEqual(1);
            expect(summary.length, rName).toBeLessThanOrEqual(3);
        });
    });

    test("writes bullets without colons or semicolons", () => {
        resources
            .flatMap(({ summary }) => summary)
            .forEach((text) => expect(text).not.toMatch(/[:;]/));
    });

    // Names are shown, sorted, searched and matched by Start Here as written, so stray spaces would show up.
    test("writes names, descriptions and links without surrounding spaces", () => {
        resources.forEach(({ rName, rDescription, rLink }) => {
            [rName, rDescription, rLink].forEach((text) => expect(text, rName).toBe(text.trim()));
        });
    });

    test("files the career office and F-1 work resources under Jobs & internships, and no club", () => {
        const jobs = resources.filter(({ tags }) => tags.includes("Jobs & internships")).map(({ rName }) => rName);
        expect(jobs.sort()).toEqual([
            "Curricular Practical Training for F-1 Students",
            "On-campus Employment for F-1 Students",
            "Post Completion OPT for F-1 Students",
            "iMentorship",
            "iSchool Career Services (Canvas)",
        ]);
    });

    // A typo in a tag would otherwise drop the resource from that filter without any sign.
    test("spells every type and tag as the filters do", () => {
        resources.forEach(({ rName, type, tags }) => {
            expect(typeTags, `${rName} has type "${type}"`).toContain(type);
            tags.forEach((tag) => expect(allTags, `${rName} has tag "${tag}"`).toContain(tag));
        });
    });
});
