/*
Purpose: The homepage's events section: the next few events, or the most recent
         ones when nothing is upcoming, each linking to its week on the calendar.

Loads the list itself and handles loading, failure, and retry in the section.
Which events to show and how to word them lives in utils/homeEvents.
*/

import { useId } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import useEventList from "../hooks/useEventList";
import EventCategoryPills from "./EventCategoryPills";
import EventThumbnail from "./EventThumbnail";
import { categoriesFor } from "../utils/eventStreams";
import { calendarWeekHref, dayLabel, pickHomeEvents, seeAllLabel, startOf } from "../utils/homeEvents";

// One of "loading", "failed", "empty", or "list": the section shows exactly one.
function sectionState(status, items) {
  if (status !== "ready") return status;
  return items.length > 0 ? "list" : "empty";
}

function HomeEventRow({ event, now }) {
  const start = startOf(event);

  return (
    <Link
      className="homeEvents__row"
      to={calendarWeekHref(start)}
      data-tone={categoriesFor(event)[0]?.toLowerCase()}
    >
      <span className="homeEvents__date" aria-hidden="true">
        <span>{format(start, "MMM")}</span>
        <strong>{format(start, "d")}</strong>
      </span>
      <EventThumbnail event={event} />
      <span className="homeEvents__body">
        <span className="homeEvents__meta">
          {dayLabel(start, now)} · {format(start, "h:mm a")} ·{" "}
          {event.eLocation || "Location to be announced"}
        </span>
        <strong>{event.eName}</strong>
        {event.eOrganizers && (
          <span className="homeEvents__host">Hosted by {event.eOrganizers}</span>
        )}
        <EventCategoryPills event={event} />
      </span>
    </Link>
  );
}

function HomeEvents() {
  const headingId = useId();
  const { records, status, retry } = useEventList();
  const now = new Date();
  const picked = pickHomeEvents(records, now);
  const state = sectionState(status, picked.items);
  const showingLatest = state === "list" && picked.kind === "latest";

  return (
    <section className="homeEvents" aria-labelledby={headingId}>
      <div className="homeEvents__header">
        <div>
          <h2 id={headingId}>
            {showingLatest ? "Latest events." : "Upcoming events."}
          </h2>
          {showingLatest && (
            <p>
              Nothing is scheduled yet. Here&apos;s what IUGA ran most recently.
            </p>
          )}
        </div>
      </div>

      {state === "loading" && (
        <div className="homeEvents__notice" role="status">
          <p>Loading events…</p>
        </div>
      )}

      {state === "failed" && (
        <div className="homeEvents__notice" role="alert">
          <p>We couldn&apos;t load events. Please try again.</p>
          <button type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className="homeEvents__notice">
          <p>No events yet. Check back soon.</p>
        </div>
      )}

      {state === "list" && (
        <>
          <ol className="homeEvents__list">
            {picked.items.map((event) => (
              <li key={event.eId}>
                <HomeEventRow event={event} now={now} />
              </li>
            ))}
          </ol>
          <Link
            className="pill-button homePrimaryLink homeEvents__more"
            to="/events"
          >
            {seeAllLabel(picked)}
          </Link>
        </>
      )}
    </section>
  );
}

export default HomeEvents;
