/*
Purpose: Word-based search for the resources pages: matching, relevance scoring, and highlighting.

Expected Request Information:
- query: what the student typed; it is split into lowercase words.
- resource: a record with rName, rDescription, tags, and highlights.
- synonyms: search-only alternate words, e.g. { job: ["career"] }; keys and values are lowercase.

Expected Response Information:
- tokenize(query) returns the search words.
- scoreResource(resource, tokens, synonyms) returns 0 unless every word matches somewhere; otherwise a
  relevance score that ranks name matches above tag, highlight, and description matches.
- textMatchesTokens(text, tokens, synonyms) says whether every word matches the text.
- buildHighlightPattern(tokens, synonyms) returns a one-group RegExp for String.split, or null with no words.
*/

const FIELD_WEIGHTS = [
    ["name", 5],
    ["tags", 3],
    ["highlights", 2],
    ["description", 1],
];
const NAME_START_BONUS = 2;
const SYNONYM_FACTOR = 0.5;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Terms match from the start of a word, so "ai" finds "AI/ML" but not "maintain".
const termSource = (term) => `${/^\w/.test(term) ? "\\b" : ""}${escapeRegExp(term)}`;
const termPattern = (term) => new RegExp(termSource(term), "i");

export const tokenize = (query) => query.toLowerCase().split(/\s+/).filter(Boolean);

// A word also matches as its singular and as any of the synonyms of either form.
const expandToken = (token, synonyms) => {
    const forms = token.length > 3 && token.endsWith("s") ? [token, token.slice(0, -1)] : [token];
    return [
        ...forms.map((term) => ({ term, isSynonym: false })),
        ...forms.flatMap((form) => synonyms[form] ?? []).map((term) => ({ term, isSynonym: true })),
    ];
};

export const textMatchesTokens = (text, tokens, synonyms = {}) =>
    tokens.every((token) => expandToken(token, synonyms).some(({ term }) => termPattern(term).test(text)));

export const scoreResource = (resource, tokens, synonyms = {}) => {
    const fields = {
        name: resource.rName,
        tags: resource.tags.join(" "),
        highlights: resource.highlights.join(" "),
        description: resource.rDescription,
    };
    const lowerName = resource.rName.toLowerCase();

    let total = 0;
    for (const token of tokens) {
        let best = 0;
        for (const { term, isSynonym } of expandToken(token, synonyms)) {
            const pattern = termPattern(term);
            for (const [field, weight] of FIELD_WEIGHTS) {
                if (!pattern.test(fields[field])) continue;
                const bonus = field === "name" && lowerName.startsWith(term) ? NAME_START_BONUS : 0;
                best = Math.max(best, (weight + bonus) * (isSynonym ? SYNONYM_FACTOR : 1));
            }
        }
        if (best === 0) return 0;
        total += best;
    }
    return total;
};

export const buildHighlightPattern = (tokens, synonyms = {}) => {
    if (tokens.length === 0) return null;
    const terms = [...new Set(tokens.flatMap((token) => expandToken(token, synonyms).map(({ term }) => term)))];
    // Longest first so a whole word wins over a shorter term inside it.
    terms.sort((first, second) => second.length - first.length);
    return new RegExp(`(${terms.map(termSource).join("|")})`, "i");
};
