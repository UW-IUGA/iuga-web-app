/*
Purpose: Let a visitor step backward and forward one week at a time.

Expected Request Information:
- weekStart: Date of the first day of the week being shown.
- onChange: called with the first day of the week to show next.

Expected Response Information:
- Previous and next buttons around the week's date range.
*/

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { addWeeks, subWeeks } from "date-fns";
import { formatWeekLabel } from "../utils/weeklyCalendar";

function WeekNavigation({ weekStart, onChange }) {
    const previousWeek = subWeeks(weekStart, 1);
    const nextWeek = addWeeks(weekStart, 1);

    return (
        <div className="weekNavigation" role="group" aria-label="Week navigation">
            <button
                className="weekNavigation__button"
                type="button"
                aria-label={`Previous week: ${formatWeekLabel(previousWeek)}`}
                onClick={() => onChange(previousWeek)}
            >
                <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
            </button>
            <div className="weekNavigation__range" role="status" aria-live="polite">
                <span>WEEK OF</span>
                <strong>{formatWeekLabel(weekStart)}</strong>
            </div>
            <button
                className="weekNavigation__button"
                type="button"
                aria-label={`Next week: ${formatWeekLabel(nextWeek)}`}
                onClick={() => onChange(nextWeek)}
            >
                <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
            </button>
        </div>
    );
}

export default WeekNavigation;
