import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import { useEffect, useId, useRef, useState } from "react";
import { useAuthContext } from "../../context/AuthContext";
import { isProduction } from "../../runtime";
import { altLinkAction } from "../../utils/eventLink";
import { useEventRsvp } from "./EventRsvpContext";

// Sample events have no server record to RSVP to, so local development
// answers the way the server does after a short wait. The result shows in the
// popup itself, not as a toast, so it reads as part of the calendar.
const sendRsvp = async (eId, rsvpAnswers) => {
  if (!isProduction) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return { status: "success", message: "You're on the list!" };
  }

  const response = await fetch("/api/v1/events/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eId, rsvpAnswers }),
  });
  return response.json();
};

// One button asks for the questions; an event with none RSVPs in that one press.
function EventRsvpForm({ eId, questions, onSent }) {
  const { session } = useEventRsvp();
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  // Why the last RSVP did not go through, shown under the button.
  const [error, setError] = useState(null);
  const formId = useId();
  const firstInputRef = useRef(null);

  // Opening the questions moves focus to the first one.
  useEffect(() => {
    if (isOpen) firstInputRef.current?.focus();
  }, [isOpen]);

  const submit = async (answers) => {
    setIsSending(true);
    setError(null);
    try {
      const data = await sendRsvp(eId, answers);
      if (data.status === "error") {
        setError(
          data.message || "Your RSVP didn't go through. Please try again.",
        );
      } else {
        onSent(eId, session);
      }
    } catch (sendError) {
      console.error("Unable to RSVP", sendError);
      setError("Your RSVP didn't go through. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (submitEvent) => {
    submitEvent.preventDefault();
    const formData = new FormData(submitEvent.target);
    submit(
      questions.map((question) => ({
        qId: question.qId,
        aString: formData.get(question.qId),
      })),
    );
  };

  const errorMessage = error && (
    <p className="eventRsvp__error" role="alert">
      {error}
    </p>
  );

  // Closed: one button. With nothing to ask, it RSVPs straight away.
  if (!isOpen) {
    return (
      <>
        <button
          type="button"
          className="eventRsvp__button"
          aria-expanded="false"
          aria-controls={formId}
          disabled={isSending}
          onClick={() => (questions.length > 0 ? setIsOpen(true) : submit([]))}
        >
          {isSending ? "Sending…" : "RSVP"}
        </button>
        {errorMessage}
      </>
    );
  }

  return (
    <form id={formId} className="eventRsvp__form" onSubmit={handleSubmit}>
      {questions.map((question, index) => (
        <div className="eventRsvp__field" key={question.qId}>
          <label htmlFor={`${formId}-${question.qId}`}>
            {question.qString}
          </label>
          <input
            ref={index === 0 ? firstInputRef : undefined}
            id={`${formId}-${question.qId}`}
            name={question.qId}
            type="text"
            required
          />
        </div>
      ))}
      <div className="eventRsvp__actions">
        <button
          type="submit"
          className="eventRsvp__button"
          disabled={isSending}
        >
          {isSending ? "Sending…" : "RSVP"}
        </button>
        <button
          type="button"
          className="eventRsvp__cancel"
          disabled={isSending}
          onClick={() => setIsOpen(false)}
        >
          Cancel
        </button>
      </div>
      {errorMessage}
    </form>
  );
}

// What a student can do about attending, in the event's popup or day panel.
function EventRsvp({ event }) {
  const { isAuthenticated, signIn } = useAuthContext();
  const { detailsFor, retryDetails, hasRsvpd, markRsvpd } = useEventRsvp();
  const { status, details } = detailsFor(event.id);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Attendance actions close when the event starts.
  const hasNotStarted = event.start > new Date();
  if (!hasNotStarted) return null;

  // The event's own sign-up page, if it has one. It shows whether or not the event also takes an RSVP here.
  const signUpLink = details?.eAltLink?.url ? details.eAltLink : null;

  let content;
  if (status === "loading") {
    content = (
      <p className="eventRsvp__note" role="status">
        Loading RSVP details…
      </p>
    );
  } else if (status === "failed") {
    content = (
      <div className="eventRsvp__note" role="alert">
        <p>We couldn&apos;t load RSVP details.</p>
        <button
          type="button"
          className="eventRsvp__cancel"
          onClick={() => retryDetails(event.id)}
        >
          Try again
        </button>
      </div>
    );
  } else if (hasRsvpd(event.id, details.hasRSVPd)) {
    content = (
      <div className="eventRsvp__confirmed" role="status">
        <span className="eventRsvp__badge" aria-hidden="true">
          <FontAwesomeIcon icon={faCheck} />
        </span>
        <span className="eventRsvp__confirmedText">
          <strong>You&apos;re on the list</strong>
          <span>
            {event.location ? `See you at ${event.location}` : "See you there"}
          </span>
        </span>
      </div>
    );
  } else if (details.rsvpEnabled && !isAuthenticated) {
    const startSignIn = async () => {
      setIsSigningIn(true);
      try {
        await signIn();
      } catch (error) {
        console.error("Sign-in did not finish", error);
      } finally {
        setIsSigningIn(false);
      }
    };
    content = (
      <>
        <p className="eventRsvp__note">Sign in with your UW account to RSVP.</p>
        <button
          type="button"
          className="eventRsvp__button"
          disabled={isSigningIn}
          onClick={startSignIn}
        >
          {isSigningIn ? "Signing in…" : "Sign in to RSVP"}
        </button>
      </>
    );
  } else if (details.rsvpEnabled) {
    content = (
      <EventRsvpForm
        eId={event.id}
        questions={details.rsvpQuestions ?? []}
        onSent={markRsvpd}
      />
    );
  } else if (!signUpLink) {
    content = (
      <p className="eventRsvp__note">
        RSVP isn&apos;t available for this event.
      </p>
    );
  }

  // Beside an RSVP control the sign-up link is the quieter option, so the RSVP keeps the one strong fill.
  return (
    <div className="eventRsvp">
      {content}
      {signUpLink && (
        <a
          className={
            details.rsvpEnabled ? "eventRsvp__link" : "eventRsvp__button"
          }
          href={signUpLink.url}
          target="_blank"
          rel="noreferrer"
        >
          {altLinkAction(signUpLink)}
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

export default EventRsvp;
