// Wraps each search match in <mark>; pattern comes from buildHighlightPattern and may be null.
const HighlightMatch = ({ text, pattern }) => {
    if (!pattern) return text;
    // Splitting on the pattern's one capture group puts the matches at the odd indexes.
    return text.split(pattern).map((part, index) => (
        index % 2 === 1 ? <mark key={index}>{part}</mark> : part
    ));
};

export default HighlightMatch;
