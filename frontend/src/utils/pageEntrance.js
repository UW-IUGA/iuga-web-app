/*
Purpose: Shared helpers for the site's once-per-visit entrance wave and for
         overlays that scale in from their trigger. One place sets the entrance
         order variables and the session clocks; pages and chrome only call these.

Expected Request Information:
- A 0-based reading-order index, and for a grid, the column count.
- For columnsForWidth / useEntranceColumns, a map of minimum widths to column
  counts (a module-level object, so it stays stable across renders).
- onceKey, identifying a page or chrome so the wave plays at most once per
  visit (and so a remount mid-wave does not start a second clock).

Expected Response Information:
- Objects that set --entrance-i, --entrance-row, or --overlay-origin.
- Whether the wave for a key is still playing.
*/
export const ENTRANCE_WAVE_MS = 1200;

// Read at the moment of an animation rather than once, so flipping the OS
// setting applies to the next one without a reload.
export const prefersReducedMotion = () =>
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const nowMs = () => Date.now();

// 0-based reading order: left to right, then the next row.
export const entranceOrder = (index, extra = {}) => ({
    ...extra,
    "--entrance-i": index,
});

// Row index for a row-by-row entrance. Items inside a row still use
// --entrance-i for their place in that row.
export const entranceRow = (row, extra = {}) => ({
    ...extra,
    "--entrance-row": row,
});

// Reading order on a fixed column grid: row, then the index in that row.
export const entranceGridOrder = (index, columns, extra = {}) => {
    const count = Math.max(1, columns);
    return {
        ...extra,
        "--entrance-row": Math.floor(index / count),
        "--entrance-i": index % count,
    };
};

// Origin for an overlay that should scale in from its trigger, not from center.
export const overlayOrigin = (origin, extra = {}) => ({
    ...extra,
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

// One clock per key. The clock starts on the first ready call and stays
// active for ENTRANCE_WAVE_MS, so a remount mid-wave keeps entering without
// starting over from a new start time (the new node will still play CSS
// from the beginning, but a late remount after the wave will not replay).
const waveStartedAt = new Map();
const CHROME_KEY = "chrome";

const startWave = (key) => {
    if (!waveStartedAt.has(key)) waveStartedAt.set(key, nowMs());
};

export const waveIsPlaying = (key, duration = ENTRANCE_WAVE_MS) => {
    const started = waveStartedAt.get(key);
    if (started == null) return false;
    return nowMs() - started < duration;
};

export const waveRemainingMs = (key, duration = ENTRANCE_WAVE_MS) => {
    const started = waveStartedAt.get(key);
    if (started == null) return 0;
    return Math.max(0, duration - (nowMs() - started));
};

export const chromeShouldEnter = (duration = ENTRANCE_WAVE_MS) => {
    startWave(CHROME_KEY);
    return waveIsPlaying(CHROME_KEY, duration);
};

export const pageShouldEnter = (onceKey, duration = ENTRANCE_WAVE_MS) => {
    if (onceKey == null || onceKey === "") {
        throw new Error("pageShouldEnter requires a onceKey so a remount cannot restart the wave");
    }
    startWave(onceKey);
    return waveIsPlaying(onceKey, duration);
};

export const resetPageEntranceForTests = () => {
    waveStartedAt.clear();
};
