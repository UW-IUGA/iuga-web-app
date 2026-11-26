/*
Purpose: Word-based search for the Resources page: matching and highlighting.

Expected Request Information:
- query: what the student typed; it is split into lowercase words.
- resource: a record with rName, rDescription, tags, and highlights.
- synonyms: search-only alternate words, e.g. { job: ["career"] }; keys and values are lowercase.

Expected Response Information:
- tokenize(query) returns the search words.
- textMatchesTokens(text, tokens, synonyms) says whether every word matches the text.
- resourceMatchesTokens(resource, tokens, synonyms) says whether every word matches somewhere in the resource.
- buildHighlightPattern(tokens, synonyms) returns a one-group RegExp for String.split, or null with no words.
*/

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Terms match from the start of a word, so "ai" finds "AI/ML" but not "maintain".
const termSource = (term) => `${/^\w/.test(term) ? "\\b" : ""}${escapeRegExp(term)}`;
const termPattern = (term) => new RegExp(termSource(term), "i");

export const tokenize = (query) => query.toLowerCase().split(/\s+/).filter(Boolean);

// A word also matches as its singular and as any of the synonyms of either form.
const expandToken = (token, synonyms) => {
    const forms = token.length > 3 && token.endsWith("s") ? [token, token.slice(0, -1)] : [token];
    return [...forms, ...forms.flatMap((form) => synonyms[form] ?? [])];
};

export const textMatchesTokens = (text, tokens, synonyms = {}) =>
    tokens.every((token) => expandToken(token, synonyms).some((term) => termPattern(term).test(text)));

// Each word may match a different part of the resource, so the parts are searched as one text.
export const resourceMatchesTokens = (resource, tokens, synonyms = {}) => textMatchesTokens(
    [resource.rName, ...resource.tags, ...resource.highlights, resource.rDescription].join("\n"),
    tokens,
    synonyms
);

export const buildHighlightPattern = (tokens, synonyms = {}) => {
    if (tokens.length === 0) return null;
    const terms = [...new Set(tokens.flatMap((token) => expandToken(token, synonyms)))];
    // Longest first so a whole word wins over a shorter term inside it.
    terms.sort((first, second) => second.length - first.length);
    return new RegExp(`(${terms.map(termSource).join("|")})`, "i");
};
