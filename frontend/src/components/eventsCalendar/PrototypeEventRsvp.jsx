import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCheck } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useId, useRef, useState } from "react";
import { useAuthContext } from "../../context/AuthContext";
import { isProduction } from "../../runtime";
import { usePrototypeEventRsvp } from "./PrototypeEventRsvpContext";

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

function PrototypeRsvpForm({ eId, questions, collapsed, onSent }) {
    const { session } = usePrototypeEventRsvp();
    const [isOpen, setIsOpen] = useState(!collapsed);
    const [isSending, setIsSending] = useState(false);
    // Why the last RSVP did not go through, shown under the button.
    const [error, setError] = useState(null);
    const formId = useId();
    const firstInputRef = useRef(null);

    // The compact version opens on request; move to the first question when it does.
    useEffect(() => {
        if (collapsed && isOpen) firstInputRef.current?.focus();
    }, [collapsed, isOpen]);

    const submit = async (answers) => {
        setIsSending(true);
        setError(null);
        const sentInSession = session;
        try {
            const data = await sendRsvp(eId, answers);
            if (data.status === "error") {
                setError(data.message || "Your RSVP didn't go through. Please try again.");
            } else {
                onSent(eId, sentInSession);
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
        <p className="prototypeRsvp__error" role="alert">
            {error}
        </p>
    );

    // Compact: one button. With nothing to ask, it RSVPs straight away.
    if (collapsed && !isOpen) {
        return (
            <>
                <button
                    type="button"
                    className="prototypeRsvp__button"
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
        <form id={formId} className="prototypeRsvp__form" onSubmit={handleSubmit}>
            {questions.map((question, index) => (
                <div className="prototypeRsvp__field" key={question.qId}>
                    <label htmlFor={`${formId}-${question.qId}`}>{question.qString}</label>
                    <input
                        ref={index === 0 ? firstInputRef : undefined}
                        id={`${formId}-${question.qId}`}
                        name={question.qId}
                        type="text"
                        required
                    />
                </div>
            ))}
            <div className="prototypeRsvp__actions">
                <button type="submit" className="prototypeRsvp__button" disabled={isSending}>
                    {isSending ? "Sending…" : "RSVP"}
                </button>
                {collapsed && (
                    <button
                        type="button"
                        className="prototypeRsvp__cancel"
                        disabled={isSending}
                        onClick={() => setIsOpen(false)}
                    >
                        Cancel
                    </button>
                )}
            </div>
            {errorMessage}
        </form>
    );
}

// What a student can do about attending, in the event's popup or day panel.
function PrototypeEventRsvp({ event }) {
    const { isAuthenticated, signIn } = useAuthContext();
    const { variant, detailsFor, retryDetails, hasRsvpd, markRsvpd } = usePrototypeEventRsvp();
    const { status, details } = detailsFor(event.id);
    const [isSigningIn, setIsSigningIn] = useState(false);

    const isUpcoming = (event.end ?? event.start) >= new Date();

    let content;
    if (!isUpcoming) {
        content = <p className="prototypeRsvp__note">This event has already happened.</p>;
    } else if (status === "loading") {
        content = (
            <p className="prototypeRsvp__note" role="status">
                Loading RSVP details…
            </p>
        );
    } else if (status === "failed") {
        content = (
            <div className="prototypeRsvp__note" role="alert">
                <p>We couldn&apos;t load RSVP details.</p>
                <button type="button" className="prototypeRsvp__cancel" onClick={() => retryDetails(event.id)}>
                    Try again
                </button>
            </div>
        );
    } else if (hasRsvpd(event.id, details.hasRSVPd)) {
        content = (
            <p className="prototypeRsvp__confirmed" role="status">
                <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                You&apos;re going. See you there.
            </p>
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
                <p className="prototypeRsvp__note">Sign in with your UW account to RSVP.</p>
                <button type="button" className="prototypeRsvp__button" disabled={isSigningIn} onClick={startSignIn}>
                    {isSigningIn ? "Signing in…" : "Sign in to RSVP"}
                </button>
            </>
        );
    } else if (details.rsvpEnabled) {
        content = (
            <PrototypeRsvpForm
                eId={event.id}
                questions={details.rsvpQuestions ?? []}
                collapsed={variant === 2}
                onSent={markRsvpd}
            />
        );
    } else if (details.eAltLink?.title && details.eAltLink?.url) {
        content = (
            <a className="prototypeRsvp__button" href={details.eAltLink.url} target="_blank" rel="noreferrer">
                {details.eAltLink.title}
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
            </a>
        );
    } else {
        content = <p className="prototypeRsvp__note">RSVP isn&apos;t available for this event.</p>;
    }

    return <div className="prototypeRsvp">{content}</div>;
}

export default PrototypeEventRsvp;
