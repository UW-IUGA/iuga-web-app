/*
Purpose: Mark the search words inside a piece of resource text.

Expected Request Information:
- text: the text to show.
- pattern: from buildHighlightPattern, or null when there is no search.

Expected Response Information:
- The text, with each match wrapped in <mark>.
*/

function HighlightMatch({ text, pattern }) {
    if (!pattern) return text;
    // Splitting on the pattern's one capture group puts the matches at the odd indexes.
    return text.split(pattern).map((part, index) => (index % 2 === 1 ? <mark key={index}>{part}</mark> : part));
}

export default HighlightMatch;
