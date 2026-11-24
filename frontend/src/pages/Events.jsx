/*
Purpose: The events page: a calendar of IUGA events with year, month, week and day views.
Authentication/Authorization Requirements: None for the calendar. Officers with events.requests.manage
  also get event operations below it, with the controls their other events permissions allow.
Expected Request Information: Optional query parameters view (year, week or day; month when absent)
  and date (YYYY-MM-DD, today when absent), so any view can be shared or bookmarked.
Expected Response Information: The controls and the chosen view, with the mini month and colour key
  beside month, week and day. While the list loads, or if it fails, the calendar says so.
  Below it, the previous events. Event operations call /api/v1/event-requests (see EventOperations).
*/

import { useEffect, useMemo, useRef, useState } from "react";
import EventOperations from "../components/EventOperations";
import CalendarControls from "../components/eventsCalendar/CalendarControls";
import DayView from "../components/eventsCalendar/DayView";
import { EventRsvpProvider } from "../components/eventsCalendar/EventRsvpContext";
import Legend from "../components/eventsCalendar/Legend";
import MiniMonth from "../components/eventsCalendar/MiniMonth";
import MonthCard from "../components/eventsCalendar/MonthCard";
import PastEvents from "../components/eventsCalendar/PastEvents";
import WeekView from "../components/eventsCalendar/WeekView";
import YearView from "../components/eventsCalendar/YearView";
import { useAuthContext } from "../context/AuthContext";
import useCalendarView from "../hooks/useCalendarView";
import useEventList from "../hooks/useEventList";
import useSwipeStep from "../hooks/useSwipeStep";
import useTagFilter from "../hooks/useTagFilter";
import {
  buildMonthGrid,
  filterByTags,
  MONTH_NAMES,
  normalizeEvent,
  zonedParts,
} from "../utils/calendar/calendar";

// Views that carry the mini month beside them. Year view is the exception:
// it is already every month at once, so another would only repeat the screen.
const SIDEBAR_MODES = ["month", "week", "day"];

// 520ms rise plus the last wave's 120ms delay, Events' tighter window.
const PAGE_ENTRANCE_WAVE_MS = 640;

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
  // On for the first visit's arrival wave only (see _page.scss), so a later
  // view, date, or filter change does not replay it.
  const [entering, setEntering] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setEntering(false),
      PAGE_ENTRANCE_WAVE_MS,
    );
    return () => window.clearTimeout(timeout);
  }, []);

  const { mode, selectedDate, goToDay, goToDate, goToToday, step, setMode } =
    useCalendarView();
  const { can, isAuthenticated } = useAuthContext();
  const { records, status, retry } = useEventList({
    refreshKey: isAuthenticated,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Bumped by the controls' Today and arrows, so the mini month returns to the
  // selected date's month even when the press leaves the date unchanged.
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
  const allEvents = useMemo(() => records.map(normalizeEvent), [records]);

  // The legend is also the tag filter. What it leaves is all the calendar shows,
  // in every view and in the mini month's and date picker's dots. With every tag
  // on, this is allEvents itself.
  const { shownTags, isTagShown, toggleTag, showAllTags, isFiltered } =
    useTagFilter();
  const events = useMemo(
    () => filterByTags(allEvents, shownTags),
    [allEvents, shownTags],
  );
  const tagFilter = {
    isTagShown,
    onToggle: toggleTag,
    onShowAll: showAllTags,
    isFiltered,
  };

  const selectedDateParts = zonedParts(selectedDate);

  // The single month the month view shows, positioned by the selected date,
  // with the days either side of it filled in too.
  const rows = useMemo(
    () =>
      buildMonthGrid(selectedDateParts.year, selectedDateParts.month, events, {
        withOutside: true,
      }),
    [selectedDateParts.year, selectedDateParts.month, events],
  );

  let view;
  if (mode === "year") {
    view = <YearView events={events} onPickDay={goToDay} />;
  } else if (mode === "week") {
    view = (
      <WeekView anchor={selectedDate} events={events} onSelectDay={goToDay} />
    );
  } else if (mode === "day") {
    view = (
      <DayView anchor={selectedDate} events={events} />
    );
  } else {
    view = (
      <MonthCard
        title={`${MONTH_NAMES[selectedDateParts.month]} ${selectedDateParts.year}`}
        rows={rows}
        onPickDay={goToDay}
      />
    );
  }

  const calendar = (
    <>
      <div className="eventsCalendar eventsCalendar--page">
        <section
          className={`page page--events${entering ? " page--events--enter" : ""}`}
        >
          <h1 className="page__title">Events</h1>

          <CalendarControls
            mode={mode}
            selectedDate={selectedDate}
            events={events}
            onModeChange={setMode}
            onToday={onToday}
            onStep={onStep}
            onPickDate={goToDate}
            tagFilter={tagFilter}
          />

          <div className={`events${hasSidebar ? " events--with-sidebar" : ""}`}>
            {hasSidebar && (
              <div className="events__sidebar">
                <MiniMonth
                  anchor={selectedDate}
                  events={events}
                  onPickDay={goToDate}
                  syncKey={navCount}
                />
                {/* The colour key and tag filter, under the mini month and stacked
                    to fit its width. */}
                <div className="events__legend">
                  <Legend layout="column" {...tagFilter} />
                </div>
              </div>
            )}

            <div
              ref={mainRef}
              className={`events__main${hasSidebar ? " events__main--swipe" : ""}`}
            >
              <ListStatus status={status} onRetry={retry} />
              {view}
            </div>
          </div>

          <PastEvents />
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

  return <EventRsvpProvider>{calendar}</EventRsvpProvider>;
}

export default EventsPage;
