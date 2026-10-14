/*
Purpose: Recap one past event with a cover photo, a short summary, and a row of photo thumbnails.

Expected Request Information:
- event: { id, name, summary, photos: [{ src, alt, thumbnail }] }; the first photo is
  the cover. thumbnail is an optional smaller file used wherever the photo is shown small.
- reversed: when true, the cover photo sits on the right on wide screens.
- onOpenPhoto: called with the position of the photo a visitor opens.

Expected Response Information:
- A card whose photos and "View Photos" button all report which photo to open.
*/

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faImages } from "@fortawesome/free-solid-svg-icons";
import { useId } from "react";

const MAX_THUMBNAILS = 4;

// A photo's small file is enough for a thumbnail. The cover is large enough
// that high-density screens get the full-size file instead.
function PhotoButton({ photo, className = "", isCover = false, onOpen, children }) {
    const smallFile = photo.thumbnail ?? photo.src;
    const srcSet = isCover && photo.thumbnail ? `${photo.thumbnail} 1x, ${photo.src} 2x` : undefined;

    return (
        <button
            className={`pastEventCard__photo ${className}`.trim()}
            type="button"
            aria-label={`Open photo: ${photo.alt}`}
            onClick={onOpen}
        >
            <img src={smallFile} srcSet={srcSet} alt="" loading="lazy" />
            {children}
        </button>
    );
}

function PastEventCard({ event, reversed = false, onOpenPhoto }) {
    const headingId = useId();
    const [cover, ...otherPhotos] = event.photos;
    const thumbnails = otherPhotos.slice(0, MAX_THUMBNAILS);
    const hiddenCount = otherPhotos.length - thumbnails.length;

    return (
        <article className={`pastEventCard${reversed ? " pastEventCard--reversed" : ""}`} aria-labelledby={headingId}>
            <PhotoButton className="pastEventCard__cover" photo={cover} isCover onOpen={() => onOpenPhoto(0)} />
            <div className="pastEventCard__body">
                <h3 id={headingId}>{event.name}</h3>
                <p>{event.summary}</p>
                <div className="pastEventCard__thumbs">
                    {thumbnails.map((photo, offset) => (
                        <PhotoButton photo={photo} key={photo.src} onOpen={() => onOpenPhoto(offset + 1)}>
                            {offset === thumbnails.length - 1 && hiddenCount > 0 && (
                                <span className="pastEventCard__more" aria-hidden="true">+{hiddenCount}</span>
                            )}
                        </PhotoButton>
                    ))}
                </div>
                <button className="pastEventCard__viewPhotos" type="button" onClick={() => onOpenPhoto(0)}>
                    <FontAwesomeIcon icon={faImages} aria-hidden="true" />
                    View Photos
                </button>
            </div>
        </article>
    );
}

export default PastEventCard;
