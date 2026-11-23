/*
Purpose: Stand in for a missing event photo with contour lines in the event's category colour.

Expected Request Information:
- eventId: picks the drawing, so each event keeps its own.
- category: "academic", "career", or "social"; sets the colours.

Expected Response Information:
- A decorative block the parent sizes. Hidden from assistive technology,
  because the event's name and category are already written beside it.
*/

import { useMemo } from "react";
import { CONTOUR_HEIGHT, CONTOUR_WIDTH, contourLines } from "../utils/contourCover";

function ContourCover({ eventId, category, className = "" }) {
    const lines = useMemo(() => contourLines(eventId), [eventId]);

    return (
        <span className={`contourCover contourCover--${category} ${className}`.trim()} aria-hidden="true">
            <svg
                className="contourCover__drawing"
                viewBox={`0 0 ${CONTOUR_WIDTH} ${CONTOUR_HEIGHT}`}
                preserveAspectRatio="xMidYMid slice"
                focusable="false"
            >
                {lines.map((line) => (
                    <path
                        key={line.d}
                        className={line.emphasized ? "contourCover__line contourCover__line--emphasized" : "contourCover__line"}
                        d={line.d}
                    />
                ))}
            </svg>
        </span>
    );
}

export default ContourCover;
