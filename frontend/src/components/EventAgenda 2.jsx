/*
Purpose: Show one week of events as a strip of days above a list of event rows.

Expected Request Information:
- events: event records (eId, eName, eStartDate, eLocation, eOrganizers, eLabels;
  eThumbnailPath and hasRSVPd are optional).
- initialDate: optional date whose week is shown first; defaults to today.
- status: "ready" (default), "loading" while events are being fetched, or
  "failed" when they could not be fetched.
- onRetry: called when a visitor asks to try again after a failure.
- onSelectEvent: called with the event a visitor opens.

Expected Response Information:
- Week navigation, seven day buttons that filter the list to one day, and the
  week's events. An empty week offers a jump to the next upcoming event. While
  loading or after a failure it says so instead of claiming the week is empty.
*/

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faCheck, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { format, isSameDay, isToday, isValid } from "date-fns";
import { useEffect, useId, useMemo, useState } from "react";
import EventCategoryPills from "./EventCategoryPills";
import EventThumbnail from "./EventThumbnail";
import WeekNavigation from "./WeekNavigation";
import { primaryCategory } from "../utils/eventCategoryIcons";
import { eventsForDay, getWeekDays, getWeekStart } from "../utils/weeklyCalendar";

const safeDate = (value) => {
    const date = value ? new Date(value) : new Date();
    return isValid(date) ? date : new Date();
};

const eventTime = (event) => format(new Date(event.eStartDate), "h:mm a");

const countLabel = (count) => `${count} ${count === 1 ? "event" : "events"}`;

// The soonest event that is still upcoming and starts after the given day.
const nextEventAfter = (events, day) =>
    events
        .filter((event) => new Date(event.eStartDate) > day && new Date(event.eStartDate) >= new Date())
        .sort((first, second) => new Date(first.eStartDate) - new Date(second.eStartDate))[0];

function EventAgenda({ events = [], initialDate, status = "ready", onRetry, onSelectEvent }) {
    const headingId = useId();
    const [weekAnchor, setWeekAnchor] = useState(() => safeDate(initialDate));
    const [selectedDay, setSelectedDay] = useState(null);
    const weekStart = useMemo(() => getWeekStart(weekAnchor), [weekAnchor]);
    const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

    const showWeekOf = (date) => {
        setWeekAnchor(date);
        setSelectedDay(null);
    };

    useEffect(() => {
        if (initialDate) showWeekOf(safeDate(initialDate));
    }, [initialDate]);

    const days = weekDays.map((day) => ({ day, events: eventsForDay(events, day) }));
    // A day filter only applies while that day still has events, so a refreshed list never hides the rest of the week.
    const filteredDay = days.find(({ day, events: dayEvents }) => selectedDay && isSameDay(day, selectedDay) && dayEvents.length > 0)?.day;
    const visibleDays = days.filter(
        ({ day, events: dayEvents }) => dayEvents.length > 0 && (!filteredDay || isSameDay(day, filteredDay)),
    );
    const nextEvent = visibleDays.length === 0 ? nextEventAfter(events, weekDays[6]) : null;

    return (
        <section className="eventAgenda" aria-labelledby={headingId}>
            <div className="eventAgenda__header">
                <h2 id={headingId}>Find your next event.</h2>
                <WeekNavigation weekStart={weekStart} onChange={showWeekOf} />
            </div>

            <div className="eventAgenda__days" role="group" aria-label="Days this week">
                {days.map(({ day, events: dayEvents }) => {
                    const isSelected = Boolean(filteredDay) && isSameDay(day, filteredDay);
                    const classes = ["eventAgenda__day", isToday(day) && "isToday", isSelected && "isSelected"]
                        .filter(Boolean)
                        .join(" ");

                    return (
                        <button
                            className={classes}
                            type="button"
                            key={day.toISOString()}
                            disabled={dayEvents.length === 0}
                            aria-pressed={isSelected}
                            aria-label={`${format(day, "EEEE, MMMM d")}${isToday(day) ? ", today" : ""}: ${countLabel(dayEvents.length)}`}
                            onClick={() => setSelectedDay(isSelected ? null : day)}
                        >
                            <span>{isToday(day) ? "Today" : format(day, "EEE")}</span>
                            <strong>{format(day, "d")}</strong>
                            <span className="eventAgenda__dots" aria-hidden="true">
                                {dayEvents.map((event) => (
                                    <i className={primaryCategory(event).className} key={event.eId} />
                                ))}
                            </span>
                        </button>
                    );
                })}
            </div>

            {status === "loading" && (
                <div className="eventAgenda__empty" role="status">
                    <p>Loading events…</p>
                </div>
            )}
            {status === "failed" && (
                <div className="eventAgenda__empty" role="alert">
                    <p>We couldn&apos;t load events. Please try again.</p>
                    <button type="button" onClick={onRetry}>
                        Try again
                    </button>
                </div>
            )}
            {status === "ready" && (visibleDays.length === 0 ? (
                <div className="eventAgenda__empty">
                    <p>Nothing is scheduled this week.</p>
                    {nextEvent && (
                        <button type="button" onClick={() => showWeekOf(new Date(nextEvent.eStartDate))}>
                            Next event: {format(new Date(nextEvent.eStartDate), "EEE, MMM d")}
                            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                        </button>
                    )}
                </div>
            ) : (
                <ol className="eventAgenda__list">
                    {visibleDays.flatMap(({ day, events: dayEvents }) =>
                        dayEvents.map((event) => (
                            <li key={event.eId}>
                                <button
                                    className="eventAgenda__event"
                                    type="button"
                                    aria-label={`${event.eName}, ${format(day, "EEEE, MMMM d")} at ${eventTime(event)}. View details`}
                                    onClick={() => onSelectEvent?.(event)}
                                >
                                    <span className="eventAgenda__date" aria-hidden="true">
                                        <span>{format(day, "EEE")}</span>
                                        <strong>{format(day, "d")}</strong>
                                    </span>
                                    <EventThumbnail event={event} />
                                    <span className="eventAgenda__body">
                                        <span className="eventAgenda__meta">
                                            {eventTime(event)} · {event.eLocation || "Location to be announced"}
                                        </span>
                                        <strong>{event.eName}</strong>
                                        {event.eOrganizers && (
                                            <span className="eventAgenda__host">Hosted by {event.eOrganizers}</span>
                                        )}
                                        <EventCategoryPills event={event} />
                                    </span>
                                    {event.hasRSVPd ? (
                                        <span className="eventAgenda__going">
                                            <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                                            Going
                                        </span>
                                    ) : (
                                        <span className="eventAgenda__details" aria-hidden="true">
                                            Details
                                            <FontAwesomeIcon icon={faChevronRight} />
                                        </span>
                                    )}
                                </button>
                            </li>
                        )),
                    )}
                </ol>
            ))}
        </section>
    );
}

export default EventAgenda;
