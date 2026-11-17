/*
Purpose: Show an event's categories as compact coloured pills.

Expected Request Information:
- event: an event record; its eLabels are normalized to the public category names.

Expected Response Information:
- A row of small pills, one per category.
*/

import { categoriesFor } from "../utils/eventStreams";

function EventCategoryPills({ event }) {
    return (
        <span className="eventCategoryPills" aria-label="Categories">
            {categoriesFor(event).map((category) => (
                <span
                    className={`eventCategoryPills__pill eventCategoryPills__pill--${category.toLowerCase()}`}
                    key={category}
                >
                    {category}
                </span>
            ))}
        </span>
    );
}

export default EventCategoryPills;
