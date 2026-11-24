import { createContext, useCallback, useEffect, useRef, useState } from "react";

// How long a newly shown event keeps the reveal class. Matches the first-visit
// wave, including the last month-view chip (965ms).
export const FILTER_REVEAL_MS = 1000;

const EMPTY = new Set();

const defaultReveal = {
    isEvent: () => false,
    isDay: () => false,
    isMonth: () => false,
    isMore: () => false,
};

// Which event, day, or month keys should play the first-visit entrance again.
// Defaults to none, so a calendar view rendered on its own does not animate.
export const FilterRevealContext = createContext(defaultReveal);

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

// Newly visible keys after a tag is turned on or the date moves, computed
// during render so the first paint already has the class (a useEffect would
// let the items show for a frame, then jump). Nothing when items leave, the
// first-visit wave is still playing, or the view changes. A later date or
// tag change replaces the set, so a rapid next-next-next cannot stack.
export default function useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey } = {}) {
    const snapshot = useRef({
        active: false,
        mode: undefined,
        dateKey: undefined,
        tagsKey: undefined,
        idsKey: "",
        ids: null,
    });
    const [revealingIds, setRevealingIds] = useState(EMPTY);

    const nextKey = idsKey(visibleIds);
    const snap = snapshot.current;
    if (
        snap.ids === null ||
        snap.active !== active ||
        snap.mode !== mode ||
        snap.dateKey !== dateKey ||
        snap.tagsKey !== tagsKey ||
        snap.idsKey !== nextKey
    ) {
        const nextIds = visibleIds instanceof Set ? new Set(visibleIds) : new Set([...visibleIds].filter(Boolean));
        let nextRevealing = EMPTY;
        if (active && snap.ids !== null && snap.mode === mode && (snap.dateKey !== dateKey || snap.tagsKey !== tagsKey)) {
            const added = [...nextIds].filter((id) => !snap.ids.has(id));
            if (added.length) nextRevealing = new Set(added);
        }
        snapshot.current = { active, mode, dateKey, tagsKey, idsKey: nextKey, ids: nextIds };
        if (!sameSet(nextRevealing, revealingIds)) {
            setRevealingIds(nextRevealing);
        }
    }

    useEffect(() => {
        if (revealingIds.size === 0) return undefined;
        const timeout = window.setTimeout(() => setRevealingIds(EMPTY), FILTER_REVEAL_MS);
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
