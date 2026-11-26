// Read at the moment of an animation rather than once, so flipping the OS
// setting applies to the next one without a reload.
export const prefersReducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Style vars for the shared page-entrance item stagger. `index` is 0-based
// reading order: left to right, then the next row.
export const entranceIndexStyle = (index, style = {}) => ({
    ...style,
    "--entrance-i": index,
});

// Week-row index for the month view's row-by-row entrance. Chips inside a day
// still use --entrance-i for their place in that row.
export const entranceRowStyle = (row, style = {}) => ({
    ...style,
    "--entrance-row": row,
});

