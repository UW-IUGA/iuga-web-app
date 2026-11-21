/*
Purpose: The homepage's events section: the next few events, or the most recent
         ones when nothing is upcoming, each linking to its week on the calendar.

Loads the list itself and handles loading, failure, and retry in the section.
*/

import { useId } from "react";
import { Link } from "react-router-dom";
import { differenceInCalendarDays, format, isValid } from "date-fns";
import useEventList from "../hooks/useEventList";
import EventCategoryPills from "./EventCategoryPills";
import EventThumbnail from "./EventThumbnail";
import { categoriesFor } from "../utils/eventStreams";

const SHOWN_COUNT = 3;

const startOf = (event) => new Date(event.eStartDate);

// Upcoming events, soonest first. When nothing is upcoming, the most recent past
// events, newest first, so the section stays useful between event seasons.
function pickHomeEvents(events) {
  const now = new Date();
  const dated = events.filter((event) => isValid(startOf(event)));
  const upcoming = dated
    .filter((event) => startOf(event) >= now)
    .sort((a, b) => startOf(a) - startOf(b));

  if (upcoming.length > 0)
    return {
      kind: "upcoming",
      items: upcoming.slice(0, SHOWN_COUNT),
      total: upcoming.length,
    };

  const latest = dated
    .filter((event) => startOf(event) < now)
    .sort((a, b) => startOf(b) - startOf(a));
  return {
    kind: "latest",
    items: latest.slice(0, SHOWN_COUNT),
    total: latest.length,
  };
}

// "Today", "Tomorrow", "In 3 days", "2 days ago"; further out, the date itself.
function whenLabel(event, now = new Date()) {
  const days = differenceInCalendarDays(startOf(event), now);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1 && days < 7) return `In ${days} days`;
  if (days < -1 && days > -7) return `${-days} days ago`;
  return format(startOf(event), "EEE, MMM d");
}

// Names how much more the calendar holds, so the link reads as a next step.
function seeAllLabel(kind, total) {
  if (kind === "latest") return "Browse past events";
  if (total > SHOWN_COUNT) return `See all ${total} upcoming events`;
  return "See all events";
}

const calendarHref = (event) =>
  `/events?view=week&date=${format(startOf(event), "yyyy-MM-dd")}`;

function HomeEvents() {
  const headingId = useId();
  const { records, status, retry } = useEventList();
  const { kind, items, total } = pickHomeEvents(records);
  const showingLatest =
    status === "ready" && kind === "latest" && items.length > 0;

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

      {status === "loading" && (
        <div className="homeEvents__notice" role="status">
          <p>Loading events…</p>
        </div>
      )}

      {status === "failed" && (
        <div className="homeEvents__notice" role="alert">
          <p>We couldn&apos;t load events. Please try again.</p>
          <button type="button" onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div className="homeEvents__notice">
          <p>No events yet. Check back soon.</p>
        </div>
      )}

      {status === "ready" && items.length > 0 && (
        <ol className="homeEvents__list">
          {items.map((event) => (
            <li key={event.eId}>
              <Link
                className="homeEvents__row"
                to={calendarHref(event)}
                data-tone={categoriesFor(event)[0]?.toLowerCase()}
              >
                <span className="homeEvents__date" aria-hidden="true">
                  <span>{format(startOf(event), "MMM")}</span>
                  <strong>{format(startOf(event), "d")}</strong>
                </span>
                <EventThumbnail event={event} />
                <span className="homeEvents__body">
                  <span className="homeEvents__meta">
                    {whenLabel(event)} · {format(startOf(event), "h:mm a")} ·{" "}
                    {event.eLocation || "Location to be announced"}
                  </span>
                  <strong>{event.eName}</strong>
                  {event.eOrganizers && (
                    <span className="homeEvents__host">
                      Hosted by {event.eOrganizers}
                    </span>
                  )}
                  <EventCategoryPills event={event} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {status === "ready" && items.length > 0 && (
        <Link
          className="pill-button homePrimaryLink homeEvents__more"
          to="/events"
        >
          {seeAllLabel(kind, total)}
        </Link>
      )}
    </section>
  );
}

export default HomeEvents;
