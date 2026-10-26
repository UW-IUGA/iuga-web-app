import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { addDays, addMonths, addWeeks, buildWeekDates, zonedMidnight, zonedParts } from "../utils/calendar/calendar";

// The calendar's view and date live in the page's query string
// (`/events?view=week&date=2026-10-20`), so a view can be shared or bookmarked
// and Back retraces each step. Month/week/day are the same anchor rendered at
// different resolutions, so only one date is ever stored and switching view
// keeps it. Year view is the whole archive and ignores the anchor entirely.

export const VIEW_MODES = ["year", "month", "week", "day"];
export const DEFAULT_VIEW = "month";

// What the view switch calls each view: the radio group on a wide screen and
// the dropdown on a narrow one, so the two cannot name a view differently.
export const VIEW_LABELS = {
    year: "Year",
    month: "Month",
    week: "Week",
    day: "Day",
};

// One step of the prev / next arrows, at each view's own resolution. Year view
// is the whole archive, so it has no entry and does not step.
const STEP_BY = {
    month: addMonths,
    week: addWeeks,
    day: addDays,
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Rebuild the instant for local midnight of `YYYY-MM-DD`. Storing the wall
// date rather than an instant means the anchor survives a reload without
// sliding a day in another timezone.
function parseDateParam(value) {
    const match = ISO_DAY.exec(value ?? "");
    if (!match) return null;
    return zonedMidnight(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function toISODate(date) {
    const { year, month, day } = zonedParts(date);
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function useCalendarView() {
    const [params, setParams] = useSearchParams();

    const viewParam = params.get("view");
    const dateParam = params.get("date");

    const mode = VIEW_MODES.includes(viewParam) ? viewParam : DEFAULT_VIEW;
    // No stored date means today, which is what a first visit should open on.
    const anchor = useMemo(() => parseDateParam(dateParam) ?? new Date(), [dateParam]);
    const weekDates = useMemo(() => buildWeekDates(anchor), [anchor]);

    const updateCalendarUrl = useCallback(
        (nextAnchor, nextMode) => {
            const view = nextMode ?? mode;
            const date = toISODate(nextAnchor);

            // A new history entry per move, so Back steps back through the views.
            setParams((current) => {
                const next = new URLSearchParams(current);
                if (view === DEFAULT_VIEW) next.delete("view");
                else next.set("view", view);
                next.set("date", date);
                return next;
            });
        },
        [mode, setParams],
    );

    const goToDay = useCallback((date) => updateCalendarUrl(date, "day"), [updateCalendarUrl]);
    // A date at the current resolution: the month view lands on its month, the
    // week view on its week, the day view on the day. Only the anchor moves, so
    // the view stays put.
    const goToDate = useCallback((date) => updateCalendarUrl(date), [updateCalendarUrl]);
    const goToToday = useCallback(() => goToDate(new Date()), [goToDate]);
    // Prev / next by the current view's unit: a month, a week, or a day.
    const step = useCallback(
        (amount) => {
            const by = STEP_BY[mode];
            if (by) updateCalendarUrl(by(anchor, amount));
        },
        [anchor, updateCalendarUrl, mode],
    );
    const setMode = useCallback((view) => updateCalendarUrl(anchor, view), [anchor, updateCalendarUrl]);

    return {
        mode,
        anchor,
        weekDates,
        isDefaultMode: mode === DEFAULT_VIEW,
        goToDay,
        goToDate,
        goToToday,
        step,
        setMode,
    };
}
