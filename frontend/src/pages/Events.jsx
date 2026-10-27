/*
Purpose: The events page: a calendar of IUGA events with year, month, week and day views.
Authentication/Authorization Requirements: None for the calendar. Officers with events.requests.manage
  also get event operations below it, with the controls their other events permissions allow.
Expected Request Information: Optional query parameters view (year, week or day; month when absent)
  and date (YYYY-MM-DD, today when absent), so any view can be shared or bookmarked.
Expected Response Information: The toolbar and the chosen view, with the mini month and colour key
  beside month, week and day. While the list loads, or if it fails, the calendar says so.
  Event operations call /api/v1/event-requests (see EventOperations).
*/

import { useEffect, useMemo, useRef, useState } from "react";
import EventOperations from "../components/EventOperations";
import CalendarToolbar from "../components/eventsCalendar/CalendarToolbar";
import DayView from "../components/eventsCalendar/DayView";
import Legend from "../components/eventsCalendar/Legend";
import MiniMonth from "../components/eventsCalendar/MiniMonth";
import MonthCard from "../components/eventsCalendar/MonthCard";
import WeekView from "../components/eventsCalendar/WeekView";
import YearView from "../components/eventsCalendar/YearView";
import { useAuthContext } from "../context/AuthContext";
import useCalendarView from "../hooks/useCalendarView";
import useEventList from "../hooks/useEventList";
import useSwipeStep from "../hooks/useSwipeStep";
import { buildMonthGrid, MONTH_NAMES, normalizeEvent, zonedParts } from "../utils/calendar/calendar";

// Views that carry the mini month beside them. Year view is the exception:
// it is already every month at once, so another would only repeat the screen.
const SIDEBAR_MODES = ["month", "week", "day"];

// What the calendar says instead of its events while it has none to show.
function ListStatus({ status, onRetry }) {
    if (status === "loading") {
        return (
            <p className="events__status" role="status">
                Loading events…
            </p>
        );
    }
    if (status === "failed") {
        return (
            <div className="events__status" role="alert">
                <p>We couldn&apos;t load events. Please try again.</p>
                <button type="button" className="events__retry" onClick={onRetry}>
                    Try again
                </button>
            </div>
        );
    }
    return null;
}

function EventsPage() {
    const { mode, selectedDate: anchor, goToDay, goToDate, goToToday, step, setMode } = useCalendarView();
    const { records, status, retry } = useEventList();
    const { can } = useAuthContext();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    // Bumped by the toolbar's Today and arrows, so the mini month returns to the
    // anchor's month even when the press leaves the anchor where it was.
    const [navCount, setNavCount] = useState(0);
    const onToday = () => {
        setNavCount((count) => count + 1);
        goToToday();
    };
    const onStep = (amount) => {
        setNavCount((count) => count + 1);
        step(amount);
    };

    // Year view is the whole archive on one page, so it runs the full width.
    const hasSidebar = SIDEBAR_MODES.includes(mode);

    // A swipe across the view steps it, the same as the arrows, which stay. The
    // views that step are the ones with a sidebar; the year view does neither.
    const mainRef = useRef(null);
    useSwipeStep(mainRef, onStep, hasSidebar);

    // Normalized once per list, so the grids' own memos keep their inputs.
    const events = useMemo(() => records.map(normalizeEvent), [records]);

    const anchorParts = zonedParts(anchor);

    // The single month the month view shows, positioned by the anchor.
    const rows = useMemo(
        () => buildMonthGrid(anchorParts.year, anchorParts.month, events),
        [anchorParts.year, anchorParts.month, events],
    );

    let view;
    if (mode === "year") {
        view = <YearView rawEvents={records} onPickDay={goToDay} />;
    } else if (mode === "week") {
        view = <WeekView anchor={anchor} events={events} onSelectDay={goToDay} />;
    } else if (mode === "day") {
        view = <DayView anchor={anchor} events={events} onSelectDay={goToDay} />;
    } else {
        view = (
            <MonthCard
                title={`${MONTH_NAMES[anchorParts.month]} ${anchorParts.year}`}
                rows={rows}
                onPickDay={goToDay}
            />
        );
    }

    return (
        <>
            <div className="eventsCalendar eventsCalendar--page">
                <section className="page page--events">
                    <h1 className="page__title">Events</h1>

                    <CalendarToolbar
                        mode={mode}
                        anchor={anchor}
                        events={events}
                        onModeChange={setMode}
                        onToday={onToday}
                        onStep={onStep}
                        onPickDate={goToDate}
                    />

                    <div className={`events${hasSidebar ? " events--with-sidebar" : ""}`}>
                        {hasSidebar && (
                            <div className="events__sidebar">
                                <MiniMonth anchor={anchor} events={events} onPickDay={goToDate} syncKey={navCount} />
                                {/* The colour key, under the mini month and stacked to fit its width. */}
                                <div className="events__legend">
                                    <Legend layout="column" />
                                </div>
                            </div>
                        )}

                        <div ref={mainRef} className={`events__main${hasSidebar ? " events__main--swipe" : ""}`}>
                            <ListStatus status={status} onRetry={retry} />
                            {view}
                        </div>
                    </div>
                </section>
            </div>

            {/* Outside the calendar's root, so the site's own form and button styles apply. */}
            <EventOperations
                canManageRequests={can("events.requests.manage")}
                canApproveLeadership={can("events.leadership.approve")}
                canManageFinance={can("events.finance.manage")}
                canCompletePurchases={can("events.purchases.complete")}
            />
        </>
    );
}

export default EventsPage;
