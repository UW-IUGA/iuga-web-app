import { buildHighlightPattern, scoreResource, textMatchesTokens, tokenize } from "./resourceSearch";

const resource = (rName, { tags = [], highlights = [], rDescription = "" } = {}) => ({ rName, tags, highlights, rDescription });

const careerServices = resource("iSchool Career Services", {
    tags: ["iSchool", "Career"],
    highlights: ["One-on-one advising for the job search"],
});
const dubsTech = resource("DubsTech", { tags: ["RSO"], highlights: ["Covers design and software engineering"] });
const uxClub = resource("UX @ UW Club", { tags: ["RSO"], highlights: ["Grow your UX skills"] });

describe("tokenize", () => {
    test("splits on any whitespace and lowercases", () => {
        expect(tokenize("  Career   ADVISING ")).toEqual(["career", "advising"]);
    });

    test("an empty or blank query has no words", () => {
        expect(tokenize("   ")).toEqual([]);
    });
});

describe("scoreResource", () => {
    test("words match anywhere in the resource, not as one phrase", () => {
        expect(scoreResource(careerServices, tokenize("career advising"))).toBeGreaterThan(0);
    });

    test("every word has to match", () => {
        expect(scoreResource(careerServices, tokenize("career hackathon"))).toBe(0);
    });

    test("words match from the start of a word only", () => {
        expect(scoreResource(resource("Maintenance club"), tokenize("ai"))).toBe(0);
        expect(scoreResource(resource("Club", { tags: ["AI/ML"] }), tokenize("ml"))).toBeGreaterThan(0);
    });

    test("a name match outranks a match in the bullets", () => {
        const query = tokenize("ux");
        expect(scoreResource(uxClub, query)).toBeGreaterThan(scoreResource(resource("Figma", { highlights: ["ux tools"] }), query));
    });

    test("a plural word matches its singular", () => {
        expect(scoreResource(careerServices, tokenize("jobs"))).toBeGreaterThan(0);
    });

    test("synonyms match but score below the typed word", () => {
        const synonyms = { coding: ["software"] };
        const direct = resource("Club", { highlights: ["coding projects"] });
        expect(scoreResource(dubsTech, tokenize("coding"), synonyms)).toBeGreaterThan(0);
        expect(scoreResource(direct, tokenize("coding"), synonyms)).toBeGreaterThan(scoreResource(dubsTech, tokenize("coding"), synonyms));
    });

    test("regex characters in a query are matched literally", () => {
        expect(scoreResource(resource("iSchool Career Services (Canvas)"), tokenize("(canvas)"))).toBeGreaterThan(0);
        expect(scoreResource(careerServices, tokenize("(.*)"))).toBe(0);
    });
});

describe("textMatchesTokens", () => {
    test("matches tag names through synonyms", () => {
        expect(textMatchesTokens("Career", tokenize("jobs"), { job: ["career"] })).toBe(true);
        expect(textMatchesTokens("Design", tokenize("jobs"), { job: ["career"] })).toBe(false);
    });
});

describe("buildHighlightPattern", () => {
    test("is null with no words", () => {
        expect(buildHighlightPattern([])).toBeNull();
    });

    test("splits text so matches land at the odd indexes", () => {
        const parts = "Covers design, data science".split(buildHighlightPattern(tokenize("data design")));
        expect(parts.filter((_, index) => index % 2 === 1)).toEqual(["design", "data"]);
    });

    test("includes synonyms so the reason for a match is visible", () => {
        expect("Career".split(buildHighlightPattern(tokenize("jobs"), { job: ["career"] }))).toEqual(["", "Career", ""]);
    });
});
