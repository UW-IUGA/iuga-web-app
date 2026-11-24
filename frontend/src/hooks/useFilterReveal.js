import { createContext, useCallback, useEffect, useRef, useState } from "react";

// How long a newly shown event keeps the filter-reveal class. Matches the CSS.
export const FILTER_REVEAL_MS = 180;

// Which event ids should play the short filter-reveal rise. Defaults to none,
// so a calendar view rendered on its own does not animate.
export const FilterRevealContext = createContext(() => false);

// Newly visible event ids after a tag is turned on, and nothing when a tag is
// turned off, the first-visit wave is still playing, or the view or date
// changed. The class comes off when the rise ends, so it cannot replay later.
export default function useFilterReveal(events, shownTags, { active } = {}) {
    const previousIds = useRef(null);
    const previousTags = useRef(null);
    const [revealingIds, setRevealingIds] = useState(() => new Set());
    const tagsKey = shownTags.join(",");

    useEffect(() => {
        const nextIds = new Set(events.map((event) => event.id).filter(Boolean));

        if (!active) {
            previousIds.current = nextIds;
            previousTags.current = tagsKey;
            setRevealingIds((current) => (current.size === 0 ? current : new Set()));
            return;
        }

        const hadIds = previousIds.current;
        const hadTags = previousTags.current;
        previousIds.current = nextIds;
        previousTags.current = tagsKey;

        // First snapshot after the entrance, or the filter itself did not change
        // (a view, date, or list refresh).
        if (hadIds === null || hadTags === null || hadTags === tagsKey) {
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
    }, [events, tagsKey, active]);

    return useCallback((id) => revealingIds.has(id), [revealingIds]);
}
