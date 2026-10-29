import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { pastEvents } from "../../assets/data/PastEventsData";
import PastEventCard from "../PastEventCard";
import PhotoLightbox from "../PhotoLightbox";

const pastEventEyebrow = (event) => [event.when, event.time, event.location].filter(Boolean).join(" · ");

// Recaps of past IUGA events under the calendar, each opening its photos in the viewer.
function PrototypePastEvents() {
    // The past event whose photos are open in the viewer, and which photo is showing.
    const [openPhoto, setOpenPhoto] = useState(null);
    const closePhoto = useCallback(() => setOpenPhoto(null), []);

    return (
        <section className="prototypePast" aria-labelledby="prototype-past-heading">
            <h2 id="prototype-past-heading" className="prototypePast__title">
                Previous events
            </h2>
            <div className="prototypePast__list">
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
                <div className="prototypeLightbox">
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

export default PrototypePastEvents;
