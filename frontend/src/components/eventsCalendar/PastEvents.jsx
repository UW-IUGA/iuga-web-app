import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { pastEvents } from "../../assets/data/PastEventsData";
import PastEventCard from "../PastEventCard";
import PhotoLightbox from "../PhotoLightbox";

const pastEventEyebrow = (event) => [event.when, event.time, event.location].filter(Boolean).join(" · ");

// Recaps of past IUGA events under the calendar, each opening its photos in the viewer.
function PastEvents() {
    // The past event whose photos are open in the viewer, and which photo is showing.
    const [openPhoto, setOpenPhoto] = useState(null);
    const closePhoto = useCallback(() => setOpenPhoto(null), []);

    return (
        <section className="pastEvents" aria-labelledby="past-events-heading">
            <h2 id="past-events-heading" className="pastEvents__title">
                Previous events
            </h2>
            <div className="pastEvents__list">
                {pastEvents.map((event, position) => (
                    <PastEventCard
                        event={event}
                        key={event.id}
                        reversed={position % 2 === 1}
                        onOpenPhoto={(index) => setOpenPhoto({ event, index })}
                    />
                ))}
            </div>

            {/* Outside the calendar's scope, whose element resets would undo the viewer's own layout. */}
            {createPortal(
                <div className="pastEventsLightbox">
                    <PhotoLightbox
                        photos={openPhoto?.event.photos}
                        index={openPhoto?.index ?? null}
                        title={openPhoto?.event.name}
                        eyebrow={openPhoto ? pastEventEyebrow(openPhoto.event) : undefined}
                        onIndexChange={(index) => setOpenPhoto((current) => ({ ...current, index }))}
                        onClose={closePhoto}
                    />
                </div>,
                document.body,
            )}
        </section>
    );
}

export default PastEvents;
