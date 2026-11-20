import { buildHighlightPattern, resourceMatchesTokens, textMatchesTokens, tokenize } from "./resourceSearch";

const resource = (rName, { tags = [], highlights = [], rDescription = "" } = {}) => ({ rName, tags, highlights, rDescription });

const careerServices = resource("iSchool Career Services", {
    tags: ["iSchool", "Career"],
    highlights: ["One-on-one advising for the job search"],
});
const dubsTech = resource("DubsTech", { tags: ["RSO"], highlights: ["Covers design and software engineering"] });

describe("tokenize", () => {
    test("splits on any whitespace and lowercases", () => {
        expect(tokenize("  Career   ADVISING ")).toEqual(["career", "advising"]);
    });

    test("an empty or blank query has no words", () => {
        expect(tokenize("   ")).toEqual([]);
    });
});

describe("resourceMatchesTokens", () => {
    test("words match anywhere in the resource, not as one phrase", () => {
        expect(resourceMatchesTokens(careerServices, tokenize("career advising"))).toBe(true);
    });

    test("every word has to match", () => {
        expect(resourceMatchesTokens(careerServices, tokenize("career hackathon"))).toBe(false);
    });

    test("words match from the start of a word only", () => {
        expect(resourceMatchesTokens(resource("Maintenance club"), tokenize("ai"))).toBe(false);
        expect(resourceMatchesTokens(resource("Club", { tags: ["AI/ML"] }), tokenize("ml"))).toBe(true);
    });

    test("a plural word matches its singular", () => {
        expect(resourceMatchesTokens(careerServices, tokenize("jobs"))).toBe(true);
    });

    test("synonyms match", () => {
        expect(resourceMatchesTokens(dubsTech, tokenize("coding"), { coding: ["software"] })).toBe(true);
    });

    test("regex characters in a query are matched literally", () => {
        expect(resourceMatchesTokens(resource("iSchool Career Services (Canvas)"), tokenize("(canvas)"))).toBe(true);
        expect(resourceMatchesTokens(careerServices, tokenize("(.*)"))).toBe(false);
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
