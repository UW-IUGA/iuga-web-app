import { createContext, useCallback, useEffect, useRef, useState } from "react";

// How long a newly shown event keeps the filter-reveal class. Matches the CSS.
export const FILTER_REVEAL_MS = 180;

// Which event ids should play the short filter-reveal rise. Defaults to none,
// so a calendar view rendered on its own does not animate.
export const FilterRevealContext = createContext(() => false);

// Newly visible event ids after a tag is turned on or the date moves, and
// nothing when items leave, the first-visit wave is still playing, or the
// view changes. The class comes off when the rise ends, so it cannot replay.
export default function useFilterReveal(visibleIds, { active, mode, dateKey, tagsKey } = {}) {
    const previousIds = useRef(null);
    const previousCause = useRef(null);
    const [revealingIds, setRevealingIds] = useState(() => new Set());

    useEffect(() => {
        const nextIds = visibleIds instanceof Set ? new Set(visibleIds) : new Set([...visibleIds].filter(Boolean));

        if (!active) {
            previousIds.current = nextIds;
            previousCause.current = { mode, dateKey, tagsKey };
            setRevealingIds((current) => (current.size === 0 ? current : new Set()));
            return;
        }

        const hadIds = previousIds.current;
        const had = previousCause.current;
        previousIds.current = nextIds;
        previousCause.current = { mode, dateKey, tagsKey };

        // First snapshot after the entrance, a view switch, or a list refresh
        // that did not change the date or the tags.
        if (hadIds === null || had === null || had.mode !== mode || (had.dateKey === dateKey && had.tagsKey === tagsKey)) {
            return;
        }

        const added = [...nextIds].filter((id) => !hadIds.has(id));
        if (added.length === 0) {
            setRevealingIds((current) => (current.size === 0 ? current : new Set()));
            return;
        }

        setRevealingIds(new Set(added));
        const timeout = window.setTimeout(() => setRevealingIds(new Set()), FILTER_REVEAL_MS);
        return () => window.clearTimeout(timeout);
    }, [visibleIds, active, mode, dateKey, tagsKey]);

    return useCallback((id) => revealingIds.has(id), [revealingIds]);
}
