import { createContext, useCallback, useEffect, useRef, useState } from "react";
import { ENTRANCE_WAVE_MS } from "../utils/pageEntrance";

// How long the enter class stays on. Long enough for the last month-view
// chip: week row 5 at 80ms each, then a 40ms start plus 5 × 25ms in the
// row, then its 400ms rise (965ms). The first-visit page class uses this
// same value, so both waves clear together.
export { ENTRANCE_WAVE_MS };

const EMPTY = new Set();

const defaultWave = {
    isEvent: () => false,
    isDay: () => false,
    isMonth: () => false,
    isMore: () => false,
};

// Which event, day, or month keys should play the entrance wave. Defaults
// to none, so a calendar view rendered on its own does not animate.
export const EntranceWaveContext = createContext(defaultWave);

// One string for the current view, date, and filters. The hook treats a
// change of the first part as a new view (wave everything on screen) and
// any other change as a date or filter update (wave only what just appeared).
export function entranceContentKey(mode, dateKey, tags) {
    const tagsKey = Array.isArray(tags) ? tags.join(",") : tags ?? "";
    return `${mode}|${dateKey}|${tagsKey}`;
}

function idsKey(visibleKeys) {
    const list = visibleKeys instanceof Set ? [...visibleKeys] : [...visibleKeys];
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
    return contentKey.split("|")[0];
}

// Items that just appeared after the view, date, or filter changed. Computed
// during render so the first paint already has the class. A view change treats
// the whole new view as new; a date or filter change only marks items that
// were not already visible. Nothing when items leave, the first-visit wave is
// still playing, or the list refreshes in place. A later change replaces the
// set, so rapid switching cannot stack.
export default function useEntranceWave(visibleKeys, { active, contentKey } = {}) {
    const snapshot = useRef({
        active: false,
        contentKey: undefined,
        idsKey: "",
        ids: null,
    });
    const [waveKeys, setWaveKeys] = useState(EMPTY);

    const nextKey = idsKey(visibleKeys);
    const snap = snapshot.current;
    if (
        snap.ids === null ||
        snap.active !== active ||
        snap.contentKey !== contentKey ||
        snap.idsKey !== nextKey
    ) {
        const nextIds = visibleKeys instanceof Set ? new Set(visibleKeys) : new Set([...visibleKeys].filter(Boolean));
        let nextWave = EMPTY;
        if (active && snap.ids !== null && snap.contentKey !== contentKey) {
            const viewChanged = modeOf(snap.contentKey) !== modeOf(contentKey);
            const added = viewChanged ? [...nextIds] : [...nextIds].filter((id) => !snap.ids.has(id));
            if (added.length) nextWave = new Set(added);
        }
        snapshot.current = { active, contentKey, idsKey: nextKey, ids: nextIds };
        if (!sameSet(nextWave, waveKeys)) {
            setWaveKeys(nextWave);
        }
    }

    useEffect(() => {
        if (waveKeys.size === 0) return undefined;
        const timeout = window.setTimeout(() => setWaveKeys(EMPTY), ENTRANCE_WAVE_MS);
        return () => window.clearTimeout(timeout);
    }, [waveKeys]);

    const isWaving = useCallback((id) => waveKeys.has(id), [waveKeys]);

    return {
        isEvent: useCallback((id) => isWaving(`event:${id}`), [isWaving]),
        isDay: useCallback((day) => isWaving(`day:${day}`), [isWaving]),
        isMonth: useCallback((year, month) => isWaving(`month:${year}-${month}`), [isWaving]),
        isMore: useCallback((day) => isWaving(`more:${day}`), [isWaving]),
    };
}
