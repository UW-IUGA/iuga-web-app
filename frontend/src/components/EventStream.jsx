import EventCard from "./EventCard";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faCalendarDay, faGraduationCap, faUsers } from "@fortawesome/free-solid-svg-icons";
import { classifyEvents, eventsForCategory, streamHeading } from "../utils/eventStreams";

const MAX_STREAM_EVENTS = 3;

const EMPTY_STATE_COPY = {
    Academic: {
        heading: "No academic events are on the calendar right now",
        body: "Check back soon for workshops and info sessions.",
    },
    Social: {
        heading: "No social events are on the calendar right now",
        body: "Check back soon for game nights and mixers.",
    },
    Professional: {
        heading: "No professional events are on the calendar right now",
        body: "Check back soon for industry panels and networking.",
    },
};

const FALLBACK_EMPTY_COPY = {
    heading: "No events are on the calendar right now",
    body: "Check back soon.",
};

// Same category icon family as EventCard so the empty state reads as one design.
const EMPTY_STATE_ICONS = {
    Academic: faGraduationCap,
    Social: faUsers,
    Professional: faBriefcase,
};

const EventStream = ({ category, events, now }) => {
    const classified = classifyEvents(eventsForCategory(events, category), now);
    const headingId = `stream-${category.toLowerCase()}-heading`;

    return (
        <section className="eventStream" aria-labelledby={headingId}>
            <div className="streamHeader">
                <h1 id={headingId}>{streamHeading(classified.mode)}</h1>
            </div>
            {classified.mode === "empty" ? (
                <div className="eventStreamEmpty" role="status" aria-live="polite">
                    <div className={`eventStreamEmptyIcon ${category.toLowerCase()}`} aria-hidden="true">
                        <FontAwesomeIcon icon={EMPTY_STATE_ICONS[category] ?? faCalendarDay} />
                    </div>
                    <h2>{EMPTY_STATE_COPY[category]?.heading ?? FALLBACK_EMPTY_COPY.heading}</h2>
                    <p>{EMPTY_STATE_COPY[category]?.body ?? FALLBACK_EMPTY_COPY.body}</p>
                </div>
            ) : (
                <div className="upcomingEventsCardContainer eventStreamCards">
                    {classified.events.slice(0, MAX_STREAM_EVENTS).map((event) => (
                        <EventCard key={event.eId} event={event} />
                    ))}
                </div>
            )}
        </section>
    );
};

export default EventStream;
