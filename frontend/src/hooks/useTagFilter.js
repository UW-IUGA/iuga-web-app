import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { EVENT_LABELS } from "../utils/calendar/calendar";

// Which event tags the calendar shows. The legend is the filter: each of its tags
// turns on and off, and every tag is on until someone turns one off.
//
// Kept in the page's query string beside the view and date (useCalendarView), so
// it survives a reload and can be shared: `?tags=academic,social` lists the tags
// that are on, and is left out while all of them are. A change replaces the
// current history entry rather than adding one, so Back still steps through the
// views and dates instead of every tick of the filter. Unknown names are ignored.

const PARAM = "tags";

function parseTags(value) {
    if (value === null) return EVENT_LABELS;
    const names = value.toLowerCase().split(",");
    return EVENT_LABELS.filter((tag) => names.includes(tag.toLowerCase()));
}

export default function useTagFilter() {
    const [params, setParams] = useSearchParams();
    const param = params.get(PARAM);

    // Keyed by the parameter's text, so the list keeps its identity between
    // renders and the filtered events are worked out again only when it changes.
    const shownTags = useMemo(() => parseTags(param), [param]);

    const writeTags = useCallback(
        (tags) => {
            setParams(
                (current) => {
                    const next = new URLSearchParams(current);
                    if (tags.length === EVENT_LABELS.length) next.delete(PARAM);
                    else next.set(PARAM, tags.map((tag) => tag.toLowerCase()).join(","));
                    return next;
                },
                { replace: true },
            );
        },
        [setParams],
    );

    const isTagShown = useCallback((tag) => shownTags.includes(tag), [shownTags]);

    // In the legend's order, whichever order the tags were turned on in.
    const toggleTag = useCallback(
        (tag) =>
            writeTags(
                EVENT_LABELS.filter((label) => (label === tag ? !shownTags.includes(label) : shownTags.includes(label))),
            ),
        [shownTags, writeTags],
    );

    const showAllTags = useCallback(() => writeTags(EVENT_LABELS), [writeTags]);

    return {
        shownTags,
        isTagShown,
        toggleTag,
        showAllTags,
        isFiltered: shownTags.length < EVENT_LABELS.length,
    };
}
