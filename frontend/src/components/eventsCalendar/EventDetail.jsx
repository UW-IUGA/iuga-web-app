import { colorForLabels, formatEventDateTime } from "../../utils/calendar/calendar";

// Displays an event's details, including optional location, organizer,
// link, attendance, and RSVP information, in day overlays and popovers.
function EventDetail({ event, headingLevel = 3 }) {
    const Heading = `h${headingLevel}`;

    return (
        <article className="detail">
            <div className="detail__accent" style={{ backgroundColor: colorForLabels(event.labels) }} />

            <div className="detail__body">
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

                    {event.altLink && (
                        <div className="detail__pair">
                            <dt>Link</dt>
                            <dd>
                                <a href={event.altLink.url}>{event.altLink.title || event.altLink.url}</a>
                            </dd>
                        </div>
                    )}

                    {event.showParticipants && event.participants !== null && (
                        <div className="detail__pair">
                            <dt>Attending</dt>
                            <dd>{event.participants}</dd>
                        </div>
                    )}

                    {event.rsvpEnabled && (
                        <div className="detail__pair">
                            <dt>RSVP</dt>
                            <dd>
                                {event.rsvpQuestions.length > 0 ? (
                                    <>
                                        Questions on signup
                                        <ul className="detail__questions">
                                            {event.rsvpQuestions.map((question) => (
                                                <li key={question.qId}>{question.qString}</li>
                                            ))}
                                        </ul>
                                    </>
                                ) : (
                                    "Open"
                                )}
                            </dd>
                        </div>
                    )}
                </dl>
            </div>
        </article>
    );
}

export default EventDetail;
