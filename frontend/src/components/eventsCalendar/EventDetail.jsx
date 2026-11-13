import { useEffect } from "react";
import { colorForLabels, formatEventDateTime } from "../../utils/calendar/calendar";
import EventRsvp from "./EventRsvp";
import { useEventRsvp } from "./EventRsvpContext";

// Displays an event's details, including optional location, organizer, attendance,
// photo, and RSVP, in day overlays and popovers.
function EventDetail({ event: listEvent, headingLevel = 3 }) {
    const Heading = `h${headingLevel}`;
    // Null outside EventRsvpProvider, where there is no RSVP to show and no details to load.
    const rsvp = useEventRsvp();
    const requestDetails = rsvp?.requestDetails;

    useEffect(() => {
        requestDetails?.(listEvent.id);
    }, [requestDetails, listEvent.id]);

    // The list leaves out attendance; fill it in once the details have loaded.
    const loaded = rsvp?.detailsFor(listEvent.id).details;
    const event = loaded
        ? {
              ...listEvent,
              participants: typeof loaded.participants === "number" ? loaded.participants : null,
              showParticipants: loaded.showParticipants ?? false,
          }
        : listEvent;

    return (
        <article className="detail">
            <div className="detail__accent" style={{ backgroundColor: colorForLabels(event.labels) }} />

            <div className="detail__body">
                {event.thumbnail && <img className="detail__photo" src={event.thumbnail} alt="" loading="lazy" />}

                <div className="detail__labels">
                    {event.labels.map((label) => (
                        <span key={label} className="detail__chip" style={{ backgroundColor: colorForLabels([label]) }}>
                            {label}
                        </span>
                    ))}
                </div>

                <Heading className="detail__name">{event.name}</Heading>
                <p className="detail__when">{formatEventDateTime(event)}</p>

                {event.description && <p className="detail__description">{event.description}</p>}

                <dl className="detail__meta">
                    {event.location && (
                        <div className="detail__pair">
                            <dt>Location</dt>
                            <dd>{event.location}</dd>
                        </div>
                    )}

                    {event.organizers && (
                        <div className="detail__pair">
                            <dt>Organizers</dt>
                            <dd>{event.organizers}</dd>
                        </div>
                    )}

                    {event.showParticipants && event.participants !== null && (
                        <div className="detail__pair">
                            <dt>Attending</dt>
                            <dd>{event.participants}</dd>
                        </div>
                    )}
                </dl>

                {rsvp && <EventRsvp event={event} />}
            </div>
        </article>
    );
}

export default EventDetail;
