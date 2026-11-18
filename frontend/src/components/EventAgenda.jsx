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

const byStartDate = (first, second) => new Date(first.eStartDate) - new Date(second.eStartDate);

// The soonest event that is still upcoming and starts after the given day.
const nextEventAfter = (events, day) =>
    events
        .filter((event) => new Date(event.eStartDate) > day && new Date(event.eStartDate) >= new Date())
        .sort(byStartDate)[0];

// Every event this week. If there are none, the soonest `count` upcoming events.
// If nothing is upcoming either, the `count` most recent past events.
const getFeaturedEvents = (events, count) => {
    const now = new Date();
    const valid = events.filter((event) => isValid(new Date(event.eStartDate)));

    const thisWeek = getWeekDays(getWeekStart(now))
        .flatMap((day) => eventsForDay(valid, day))
        .sort(byStartDate);

    if (thisWeek.length > 0) {
        return { items: thisWeek, kind: "week" };
    }

    const upcoming = valid.filter((event) => new Date(event.eStartDate) >= now).sort(byStartDate);

    if (upcoming.length > 0) {
        return { items: upcoming.slice(0, count), kind: "upcoming" };
    }

    const past = valid.filter((event) => new Date(event.eStartDate) < now).sort((a, b) => byStartDate(b, a));

    return { items: past.slice(0, count), kind: "past" };
};

function EventAgenda({ events = [], initialDate, status = "ready", onRetry, onSelectEvent, featuredCount }) {
    const headingId = useId();
    const [weekAnchor, setWeekAnchor] = useState(() => safeDate(initialDate));
    const [selectedDay, setSelectedDay] = useState(null);
    // True once a visitor picks a day or changes weeks, so the featured events step aside.
    const [browsing, setBrowsing] = useState(false);

    const isFeatured = Number.isInteger(featuredCount) && featuredCount > 0;
    const featured = useMemo(
        () => (isFeatured ? getFeaturedEvents(events, featuredCount) : null),
        [events, featuredCount, isFeatured],
    );
    const showingFeatured = isFeatured && !browsing;

    // When the featured events are in a later week, the strip sits on the week of the first one.
    const anchor =
        showingFeatured && featured.kind === "upcoming" && featured.items[0]
            ? new Date(featured.items[0].eStartDate)
            : weekAnchor;
    const anchorTime = anchor.getTime();
    const weekStart = useMemo(() => getWeekStart(new Date(anchorTime)), [anchorTime]);
    const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

    const showWeekOf = (date) => {
        setWeekAnchor(date);
        setSelectedDay(null);
    };

    // Used for actions a visitor takes themselves.
    const browseWeekOf = (date) => {
        showWeekOf(date);
        setBrowsing(true);
    };

    const backToFeatured = () => {
        setBrowsing(false);
        setSelectedDay(null);
        setWeekAnchor(safeDate(initialDate));
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

    const renderEvent = (event, day) => (
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
    );

    const heading =
        showingFeatured && featured.kind === "past" && featured.items.length > 0
            ? "Recent events."
            : "Find your next event.";

    return (
        <section className="eventAgenda" aria-labelledby={headingId}>
            <div className="eventAgenda__header">
                <h2 id={headingId}>{heading}</h2>
                <WeekNavigation weekStart={weekStart} onChange={browseWeekOf} />
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
                            onClick={() => {
                                setSelectedDay(isSelected ? null : day);
                                setBrowsing(true);
                            }}
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

            {status === "ready" && showingFeatured && (
                featured.items.length === 0 ? (
                    <div className="eventAgenda__empty">
                        <p>No events yet. Check back soon.</p>
                    </div>
                ) : (
                    <ol className="eventAgenda__list">
                        {featured.items.map((event) => renderEvent(event, new Date(event.eStartDate)))}
                    </ol>
                )
            )}

            {status === "ready" && !showingFeatured && (visibleDays.length === 0 ? (
                <div className="eventAgenda__empty">
                    <p>Nothing is scheduled this week.</p>
                    {nextEvent && (
                        <button type="button" onClick={() => browseWeekOf(new Date(nextEvent.eStartDate))}>
                            Next event: {format(new Date(nextEvent.eStartDate), "EEE, MMM d")}
                            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                        </button>
                    )}
                </div>
            ) : (
                <ol className="eventAgenda__list">
                    {visibleDays.flatMap(({ day, events: dayEvents }) =>
                        dayEvents.map((event) => renderEvent(event, day)),
                    )}
                </ol>
            ))}
        </section>
    );
}

export default EventAgenda;