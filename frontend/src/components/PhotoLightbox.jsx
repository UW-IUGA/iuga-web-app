/*
Purpose: Show one photo from a set at full size, with controls to move through the set.

Expected Request Information:
- photos: array of { src, alt }.
- index: position of the photo to show, or null to keep the viewer closed.
- title: name shown below the photo; also labels the dialog.
- eyebrow: optional short line shown above the title.
- onIndexChange: called with the position of the photo to show next.
- onClose: called when the visitor closes the viewer.

Expected Response Information:
- A modal dialog. The arrow buttons, the arrow keys, a click on the right
  or left half of the photo, and a swipe left or right across it on a
  touch screen move forward or back, wrapping around the set.
  Escape, the close button, and a click outside the photo close it.
- The photos either side of the one shown are downloaded in the background,
  so moving to them shows them at once instead of waiting on the download.
*/

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useRef } from "react";
import { useModalDialog } from "../hooks/useModalDialog";
import useSwipeStep from "../hooks/useSwipeStep";

// Start downloading the photos either side of the one shown, wrapping around
// the set as the arrows do, so the next move finds its photo already here.
function useLoadPhotosEitherSide(photos, index) {
    useEffect(() => {
        if (index === null || photos.length < 2) return;
        const photosEitherSide = new Set([(index - 1 + photos.length) % photos.length, (index + 1) % photos.length]);
        for (const position of photosEitherSide) {
            const image = new Image();
            image.src = photos[position].src;
            // A photo that fails here fails again, visibly, if the visitor moves to it.
            image.decode?.().catch(() => {});
        }
    }, [photos, index]);
}

function PhotoLightbox({ photos = [], index = null, title, eyebrow, onIndexChange, onClose }) {
    const photo = index === null ? null : photos[index];
    const { dialogProps, close } = useModalDialog(Boolean(photo), onClose);
    useLoadPhotosEitherSide(photos, photo ? index : null);

    const step = (direction) => onIndexChange((index + direction + photos.length) % photos.length);

    const stageRef = useRef(null);
    useSwipeStep(stageRef, step, Boolean(photo));

    // Clicking the photo's right half goes forward and its left half goes back.
    // The buttons are drawn over the photo but sit outside it, so they keep their own behavior.
    const handleStageClick = (clickEvent) => {
        const { left, width } = clickEvent.currentTarget.getBoundingClientRect();
        step(clickEvent.clientX - left < width / 2 ? -1 : 1);
    };

    const handleKeyDown = (keyEvent) => {
        if (!photo) return;
        if (keyEvent.key === "ArrowRight") step(1);
        if (keyEvent.key === "ArrowLeft") step(-1);
    };

    return (
        <dialog
            className="photoLightbox"
            aria-label={title ? `${title} photos` : "Photos"}
            onKeyDown={handleKeyDown}
            {...dialogProps}
        >
            {photo && (
                <figure>
                    <div className="photoLightbox__stage" ref={stageRef} onClick={handleStageClick}>
                        <img src={photo.src} alt={photo.alt} />
                        <span className="photoLightbox__count" aria-live="polite">
                            {index + 1} / {photos.length}
                        </span>
                    </div>
                    <figcaption>
                        {eyebrow && <span>{eyebrow}</span>}
                        {title && <strong>{title}</strong>}
                    </figcaption>
                    <button className="photoLightbox__close" type="button" aria-label="Close photos" onClick={close}>
                        <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                    </button>
                    <button
                        className="photoLightbox__previous"
                        type="button"
                        aria-label="Previous photo"
                        onClick={() => step(-1)}
                    >
                        <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
                    </button>
                    <button className="photoLightbox__next" type="button" aria-label="Next photo" onClick={() => step(1)}>
                        <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                    </button>
                </figure>
            )}
        </dialog>
    );
}

export default PhotoLightbox;
