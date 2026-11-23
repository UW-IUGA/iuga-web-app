import { readdirSync, statSync } from "node:fs";
import { resources } from "./ResourcesData";
import { allTags, clubAreas, offerings, resourceTypes, tagGroups } from "./resourceTaxonomy";

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

    // An empty filter only ever leads to "No resources match".
    test("has at least one resource for every filter", () => {
        const empty = allTags.filter((tag) => !resources.some(({ type, tags }) => type === tag || tags.includes(tag)));
        expect(empty).toEqual([]);
    });

    test("files every club under exactly one club area, and anything else under one at most", () => {
        resources.forEach(({ rName, type, tags }) => {
            const areas = tags.filter((tag) => clubAreas.includes(tag));
            expect(areas.length, `${rName} is in ${areas.join(", ") || "no area"}`)
                .toBe(type === resourceTypes.CLUB ? 1 : Math.min(areas.length, 1));
        });
    });

    // Abe's list of the iSchool's student clubs, by area, plus the four the page already had (marked).
    test("lists every club on Abe's list under its area", () => {
        const abesList = {
            iOrgs: [
                "Black in Informatics (Binfo)", "Women in Informatics (Winfo)", "iQueeries", "iMuslims", "iJournal",
            ],
            "PM/Consulting": [
                "Product Management Club @ UW", "Product Space @ UW", "Montlake Consulting Group",
                "UW Consulting Association (UWCA)", "Technology Consulting Association @ UW",
                "Business Impact Group (BIG)", "Information Consulting Group (ICG)",
            ],
            Entrepreneurship: ["DubHacks", "DubHacksNext", "iStartup Lab", "CSeed"],
            "Software Engineering": [
                "Husky Coding Project", "Society of Women Engineers UW (SWE UW)",
                "Software Engineering Career Club (SWECC)", "Web Impact UW",
                "AWS Student Builder Group @ UW", // not on Abe's list
            ],
            "DS/ML": [
                "DubsTech", "Data Science Society at UW", "interactive intelligence (i2)",
                "Claude Builder Club @ UW", "Comet @ UW", // not on Abe's list
            ],
            "UI/UX": ["UX @ UW Club", "Women in UX", "UX Health @ UW", "Figma @ UW"], // Figma is not on Abe's list
            Cybersecurity: ["ThinkCyber UW", "Batman's Kitchen", "ISACA", "WiCyS UW"],
        };
        Object.entries(abesList).forEach(([area, names]) => {
            const inArea = resources.filter(({ tags }) => tags.includes(area)).map(({ rName }) => rName);
            expect(inArea.sort(), area).toEqual([...names].sort());
        });
    });

    // Identity-based clubs also count as DEI support.
    test("files the identity-based clubs under DEI too", () => {
        const dei = resources.filter(({ type, tags }) => type === resourceTypes.CLUB && tags.includes("DEI"));
        expect(dei.map(({ rName }) => rName).sort()).toEqual([
            "Black in Informatics (Binfo)", "Society of Women Engineers UW (SWE UW)", "WiCyS UW", "Women in Informatics (Winfo)",
            "Women in UX", "iMuslims", "iQueeries",
        ].sort());
    });

    // From each club's own site or posts; a club with no offering found has none listed.
    test("lists offerings only on clubs, each spelled as in the taxonomy and listed once", () => {
        resources.filter(({ offers }) => offers).forEach(({ rName, type, offers }) => {
            expect(type, rName).toBe(resourceTypes.CLUB);
            offers.forEach((offer) => expect(offerings, `${rName} offers "${offer}"`).toContain(offer));
            expect(new Set(offers).size, rName).toBe(offers.length);
        });
    });

    test("links every resource over https", () => {
        resources.filter(({ rLink }) => rLink).forEach(({ rName, rLink }) => expect(rLink, rName).toMatch(/^https:\/\//));
    });

    test("gives every club a logo", () => {
        resources
            .filter(({ type }) => type === resourceTypes.CLUB)
            .forEach(({ rName, rImage }) => expect(rImage, rName).toBeTruthy());
    });

    // Logos load on a page of 40+ cards, so each stays small.
    test("keeps WebP logos at 30 KB or less and every logo under 100 KB", () => {
        const dir = "src/assets/logos";
        readdirSync(dir).forEach((file) => {
            const size = statSync(`${dir}/${file}`).size;
            expect(size, file).toBeLessThanOrEqual(file.endsWith(".webp") ? 30 * 1024 : 100 * 1024);
        });
    });

    // A typo in a tag would otherwise drop the resource from that filter without any sign.
    test("spells every type and tag as the filters do", () => {
        resources.forEach(({ rName, type, tags }) => {
            expect(typeTags, `${rName} has type "${type}"`).toContain(type);
            tags.forEach((tag) => expect(allTags, `${rName} has tag "${tag}"`).toContain(tag));
        });
    });
});
