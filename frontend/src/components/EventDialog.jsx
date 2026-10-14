/*
Purpose: Show one event's details in a dialog and let a signed-in student RSVP.

Authentication/Authorization Requirements: Anyone can read the details. Sending
         an RSVP requires a signed-in student; the server enforces this too.

Expected Request Information:
- event: the event to show, or null to keep the dialog closed. List fields
  (eName, eStartDate, eLocation, eOrganizers, eLabels) are enough to open it;
  detail fields (eDescription, eThumbnailPath, rsvpEnabled, rsvpQuestions,
  eAltLink, hasRSVPd, showParticipants, participants) fill in when loaded.
- isLoading: true while the detail fields are still being fetched.
- onRsvp: called with the event's eId after the server accepts an RSVP.
- onClose: called when the visitor closes the dialog.

Expected Response Information:
- A modal dialog. A successful RSVP posts to /api/v1/events/rsvp and reports
  the server's message in a toast.
*/

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faCalendarDay,
    faCheck,
    faLocationDot,
    faUserGroup,
    faUsers,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { format, isValid } from "date-fns";
import { useId, useState } from "react";
import { toast } from "react-toastify";
import EventCategoryPills from "./EventCategoryPills";
import { useAuthContext } from "../context/AuthContext";
import { useModalDialog } from "../hooks/useModalDialog";

const participantLabel = (count) => `${count} ${count === 1 ? "participant" : "participants"}`;

function RsvpForm({ event, onRsvp }) {
    const { isAuthenticated } = useAuthContext();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const questions = event.rsvpQuestions ?? [];

    const handleSubmit = async (submitEvent) => {
        submitEvent.preventDefault();
        if (!isAuthenticated) {
            toast.error("Please login first to RSVP!");
            return;
        }

        const formData = new FormData(submitEvent.target);
        const rsvpAnswers = questions.map((question) => ({
            qId: question.qId,
            aString: formData.get(question.qId),
        }));

        setIsSubmitting(true);
        try {
            const response = await fetch("/api/v1/events/rsvp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ eId: event.eId, rsvpAnswers }),
            });
            const data = await response.json();
            if (data.status === "error") {
                toast.error(data.message);
            } else {
                toast.success(data.message);
                onRsvp(event.eId);
            }
        } catch (error) {
            console.error("Unable to RSVP", error);
            toast.error("RSVP was not successful :( Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form className="eventDialog__form" onSubmit={handleSubmit}>
            {questions.map((question) => (
                <div key={question.qId}>
                    <label className="form-label" htmlFor={`rsvp-${question.qId}`}>
                        {question.qString}
                    </label>
                    <input
                        className="form-input"
                        id={`rsvp-${question.qId}`}
                        name={question.qId}
                        type="text"
                        placeholder="Your answer"
                        required
                    />
                </div>
            ))}
            <button className="eventDialog__rsvp" type="submit" disabled={isSubmitting}>
                RSVP
            </button>
        </form>
    );
}

// What a visitor can do about attending, which depends on timing and the event's RSVP settings.
function EventAttendance({ event, isLoading, onRsvp }) {
    const isUpcoming = new Date(event.eStartDate) >= new Date();
    const altLink = event.eAltLink?.title && event.eAltLink?.url ? event.eAltLink : null;

    if (isLoading) {
        return (
            <p className="eventDialog__note" role="status">
                Loading event details…
            </p>
        );
    }
    if (!isUpcoming) return <p className="eventDialog__note">This event has already happened.</p>;
    if (event.hasRSVPd) {
        return (
            <p className="eventDialog__confirmed" role="status">
                <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                You&apos;re on the list. See you there.
            </p>
        );
    }
    if (event.rsvpEnabled) return <RsvpForm event={event} onRsvp={onRsvp} />;
    if (altLink) {
        return (
            <a className="eventDialog__rsvp" href={altLink.url} target="_blank" rel="noreferrer">
                {altLink.title}
            </a>
        );
    }
    return <p className="eventDialog__note">RSVP is not available for this event.</p>;
}

function EventDialog({ event, isLoading = false, onRsvp, onClose }) {
    const titleId = useId();
    const { dialogProps, close } = useModalDialog(Boolean(event), onClose);

    return (
        <dialog className="eventDialog" aria-labelledby={titleId} {...dialogProps}>
            {event && (
                <div className={`eventDialog__layout${event.eThumbnailPath ? "" : " eventDialog__layout--noPhoto"}`}>
                    {event.eThumbnailPath && <img className="eventDialog__photo" src={event.eThumbnailPath} alt="" />}
                    <div className="eventDialog__body">
                        <EventCategoryPills event={event} />
                        <h2 id={titleId}>{event.eName ?? "Event"}</h2>
                        <ul className="eventDialog__facts">
                            {isValid(new Date(event.eStartDate)) && (
                                <li>
                                    <FontAwesomeIcon icon={faCalendarDay} fixedWidth aria-hidden="true" />
                                    <span>{format(new Date(event.eStartDate), "EEEE, MMMM d 'at' h:mm a")}</span>
                                </li>
                            )}
                            <li>
                                <FontAwesomeIcon icon={faLocationDot} fixedWidth aria-hidden="true" />
                                <span>{event.eLocation || "Location to be announced"}</span>
                            </li>
                            {event.eOrganizers && (
                                <li>
                                    <FontAwesomeIcon icon={faUserGroup} fixedWidth aria-hidden="true" />
                                    <span>Hosted by {event.eOrganizers}</span>
                                </li>
                            )}
                            {event.showParticipants && typeof event.participants === "number" && (
                                <li>
                                    <FontAwesomeIcon icon={faUsers} fixedWidth aria-hidden="true" />
                                    <span>{participantLabel(event.participants)}</span>
                                </li>
                            )}
                        </ul>
                        {event.eDescription && <p>{event.eDescription}</p>}
                        <EventAttendance event={event} isLoading={isLoading} onRsvp={onRsvp} />
                    </div>
                    <button className="eventDialog__close" type="button" aria-label="Close event details" onClick={close}>
                        <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                    </button>
                </div>
            )}
        </dialog>
    );
}

export default EventDialog;
