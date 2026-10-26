import { useId } from "react";
import EventDetail from "./EventDetail";

// What a zoomed-open day shows, over its card: Back, View day, a heading, and
// the events. Used by the year cards; the open/close animation and focus
// handling live in useZoomOverlay.
//
// Always rendered, so the animation has an element to fade. It is empty and
// click-through while closed. `isOpen`, the refs and the handlers are the
// matching values from useZoomOverlay.
function DayOverlay({ isOpen, contentRef, backRef, onBack, onKeyDown, heading, events, onViewDay }) {
    const headingId = useId();

    return (
        <div
            className="card-content"
            ref={contentRef}
            role={isOpen ? "dialog" : undefined}
            aria-labelledby={isOpen ? headingId : undefined}
            onKeyDown={onKeyDown}
        >
            {isOpen && (
                <>
                    <div className="card-content__bar card-item">
                        <button ref={backRef} type="button" className="card-content__button" onClick={onBack}>
                            Back
                        </button>
                        <button type="button" className="card-content__button" onClick={onViewDay}>
                            View day
                        </button>
                    </div>

                    {/* Under the card's h2 month title. */}
                    <h3 id={headingId} className="card-content__title card-item">
                        {heading}
                    </h3>

                    {events.map((event) => (
                        <div className="card-item" key={event.id}>
                            <EventDetail event={event} headingLevel={4} />
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

export default DayOverlay;
