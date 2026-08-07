import EventCard from "./EventCard";
import { classifyEvents, eventsForCategory, streamHeading } from "../utils/eventStreams";

const MAX_STREAM_EVENTS = 3;

const EMPTY_COPY = {
    Academic: "No academic events are on the calendar right now. Check back soon for workshops and info sessions.",
    Social: "No social events are on the calendar right now. Check back soon for game nights and mixers.",
    Professional: "No professional events are on the calendar right now. Check back soon for industry panels and networking.",
};

const FALLBACK_EMPTY_COPY = "No events are on the calendar right now. Check back soon.";

const EventStream = ({ category, events, now }) => {
    const classified = classifyEvents(eventsForCategory(events, category), now);
    const headingId = `stream-${category.toLowerCase()}-heading`;

    return (
        <section className="eventStream" aria-labelledby={headingId}>
            <div className="streamHeader">
                <h1 id={headingId}>{streamHeading(classified.mode)}</h1>
            </div>
            {classified.mode === "empty" ? (
                <div className="eventStreamEmpty">
                    <p>{EMPTY_COPY[category] ?? FALLBACK_EMPTY_COPY}</p>
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
