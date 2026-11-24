import { createContext, useCallback, useEffect, useRef, useState } from "react";

// How long a newly shown item keeps the enter class. Matches the first-visit
// wave, including the last month-view chip (965ms).
export const ENTRANCE_WAVE_MS = 1000;

const EMPTY = new Set();

const defaultWave = {
    isEvent: () => false,
    isDay: () => false,
    isMonth: () => false,
    isMore: () => false,
};

// Which event, day, or month keys should play the first-visit entrance again.
// Defaults to none, so a calendar view rendered on its own does not animate.
export const EntranceWaveContext = createContext(defaultWave);

function idsKey(visibleIds) {
    const list = visibleIds instanceof Set ? [...visibleIds] : [...visibleIds];
    return list.filter(Boolean).sort().join("\0");
}

function sameSet(left, right) {
    if (left === right) return true;
    if (left.size !== right.size) return false;
    for (const value of left) {
        if (!right.has(value)) return false;
    }
    return true;
}

function modeOf(contentKey) {
    if (!contentKey) return undefined;
    return contentKey.slice(0, contentKey.indexOf("|"));
}

// Items that just appeared after the view, date, or filter changed. Computed
// during render so the first paint already has the class. A view change treats
// the whole new view as new; a date or filter change only marks items that
// were not already visible. Nothing when items leave, the first-visit wave is
// still playing, or the list refreshes in place. A later change replaces the
// set, so rapid switching cannot stack.
export default function useEntranceWave(visibleIds, { active, contentKey } = {}) {
    const snapshot = useRef({
        active: false,
        contentKey: undefined,
        idsKey: "",
        ids: null,
    });
    const [revealingIds, setRevealingIds] = useState(EMPTY);

    const nextKey = idsKey(visibleIds);
    const snap = snapshot.current;
    if (
        snap.ids === null ||
        snap.active !== active ||
        snap.contentKey !== contentKey ||
        snap.idsKey !== nextKey
    ) {
        const nextIds = visibleIds instanceof Set ? new Set(visibleIds) : new Set([...visibleIds].filter(Boolean));
        let nextRevealing = EMPTY;
        if (active && snap.ids !== null && snap.contentKey !== contentKey) {
            const viewChanged = modeOf(snap.contentKey) !== modeOf(contentKey);
            const added = viewChanged ? [...nextIds] : [...nextIds].filter((id) => !snap.ids.has(id));
            if (added.length) nextRevealing = new Set(added);
        }
        snapshot.current = { active, contentKey, idsKey: nextKey, ids: nextIds };
        if (!sameSet(nextRevealing, revealingIds)) {
            setRevealingIds(nextRevealing);
        }
    }

    useEffect(() => {
        if (revealingIds.size === 0) return undefined;
        const timeout = window.setTimeout(() => setRevealingIds(EMPTY), ENTRANCE_WAVE_MS);
        return () => window.clearTimeout(timeout);
    }, [revealingIds]);

    const isRevealing = useCallback((id) => revealingIds.has(id), [revealingIds]);

    return {
        isEvent: useCallback((id) => isRevealing(`event:${id}`), [isRevealing]),
        isDay: useCallback((day) => isRevealing(`day:${day}`), [isRevealing]),
        isMonth: useCallback((year, month) => isRevealing(`month:${year}-${month}`), [isRevealing]),
        isMore: useCallback((day) => isRevealing(`more:${day}`), [isRevealing]),
    };
}
