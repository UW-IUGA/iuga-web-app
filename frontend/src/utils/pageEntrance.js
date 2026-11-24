/*
Purpose: Shared helpers for the site's once-per-visit entrance wave and for
         overlays that scale in from their trigger. One place sets the style
         variables and the session flags; pages and chrome only call these.

Expected Request Information:
- A 0-based reading-order index, and for a grid, the column count.
- For columnsForWidth / useEntranceColumns, a map of minimum widths to column
  counts (a module-level object, so it stays stable across renders).
- onceKey, when a route should play its wave at most once in the session
  (Student Voice after sign-in).

Expected Response Information:
- Style objects that set --entrance-i and --entrance-row.
- Session flags for the first-visit hook and the navbar/footer.
*/

export const ENTRANCE_WAVE_MS = 1000;

// Read at the moment of an animation rather than once, so flipping the OS
// setting applies to the next one without a reload.
export const prefersReducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// Style vars for the shared page-entrance item stagger. `index` is 0-based
// reading order: left to right, then the next row.
export const entranceIndexStyle = (index, style = {}) => ({
    ...style,
    "--entrance-i": index,
});

// Row index for a row-by-row entrance. Items inside a row still use
// --entrance-i for their place in that row.
export const entranceRowStyle = (row, style = {}) => ({
    ...style,
    "--entrance-row": row,
});

// Reading order on a fixed column grid: row, then the index in that row.
export const entranceGridStyle = (index, columns, style = {}) => {
    const count = Math.max(1, columns);
    return {
        ...style,
        "--entrance-row": Math.floor(index / count),
        "--entrance-i": index % count,
    };
};

// Origin for an overlay that should scale in from its trigger, not from center.
export const overlayOriginStyle = (origin, style = {}) => ({
    ...style,
    "--overlay-origin": origin,
});

// The column count for a width, given a map of minimum widths to counts.
export const columnsForWidth = (minWidths, width) => {
    let columns = 1;
    for (const [min, count] of Object.entries(minWidths).sort(
        (left, right) => Number(left[0]) - Number(right[0]),
    )) {
        if (width >= Number(min)) columns = count;
    }
    return columns;
};

// Session flags: chrome plays once per load, even if the bar remounts after
// an admin visit. A onceKey (Student Voice) plays once per session too.
let chromeHasEntered = false;
const playedOnceKeys = new Set();

export const chromeShouldEnter = () => {
    if (chromeHasEntered) return false;
    chromeHasEntered = true;
    return true;
};

export const pageShouldEnter = (onceKey) => {
    if (!onceKey) return true;
    if (playedOnceKeys.has(onceKey)) return false;
    playedOnceKeys.add(onceKey);
    return true;
};

export const resetPageEntranceForTests = () => {
    chromeHasEntered = false;
    playedOnceKeys.clear();
};
