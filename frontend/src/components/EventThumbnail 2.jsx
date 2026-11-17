/*
Purpose: Show an event's photo, or a category-coloured tile when it has none.

Expected Request Information:
- event: an event record; eThumbnailPath is optional.

Expected Response Information:
- A decorative image or icon tile. The parent sets its size.
*/

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { primaryCategory } from "../utils/eventCategoryIcons";

function EventThumbnail({ event }) {
    if (event.eThumbnailPath) {
        return <img className="eventThumbnail" src={event.eThumbnailPath} alt="" loading="lazy" />;
    }

    const category = primaryCategory(event);

    return (
        <span className={`eventThumbnail eventThumbnail--fallback eventThumbnail--${category.className}`} aria-hidden="true">
            <FontAwesomeIcon icon={category.icon} />
        </span>
    );
}

export default EventThumbnail;
