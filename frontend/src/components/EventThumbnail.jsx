/*
Purpose: Show an event's photo, or contour lines in its category colour when it has none.

Expected Request Information:
- event: an event record; eThumbnailPath is optional.

Expected Response Information:
- A decorative image or contour drawing. The parent sets its size.
*/

import { primaryCategory } from "../utils/eventCategory";
import ContourCover from "./ContourCover";

function EventThumbnail({ event }) {
    if (event.eThumbnailPath) {
        return <img className="eventThumbnail" src={event.eThumbnailPath} alt="" loading="lazy" />;
    }

    return <ContourCover className="eventThumbnail" eventId={event.eId} category={primaryCategory(event).className} />;
}

export default EventThumbnail;
