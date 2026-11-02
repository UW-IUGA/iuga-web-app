import { useMemo } from "react";
import {
    buildMonthGrid,
    colorForLabels,
    countEvents,
    formatLongDay,
    isSameDay,
    WEEKDAY_ABBREVIATIONS,
    zonedParts,
} from "../../utils/calendar/calendar";

// A month of small day buttons: the sidebar's mini month, and the one in the
// date picker that opens from the range on a phone. A pick reports the date;
// what it does is up to the caller.
//
// `bodyRef` lands on the grid of days, which the date picker swipes.
function MonthDays({ year, month, anchor, events, onPickDay, bodyRef }) {
    const rows = useMemo(() => buildMonthGrid(year, month, events), [year, month, events]);
    const today = new Date();

    return (
        <>
            <div className="mini__weekdays" aria-hidden="true">
                {WEEKDAY_ABBREVIATIONS.map((day) => (
                    <span key={day}>{day.slice(0, 1)}</span>
                ))}
            </div>

            <div className="mini__body" ref={bodyRef}>
                {rows.map((row) => (
                    <div className="mini__week" key={row[0].id}>
                        {row.map((cell) => {
                            const date = cell.date;
                            const hasEvents = cell.events.length > 0;
                            const isAnchor = isSameDay(date, anchor);
                            const isToday = isSameDay(date, today);
                            // From the date rather than cell.day, which counts from the
                            // browsed month's 1st and so is 0 or negative for the days
                            // spilling in ahead of it.
                            const dayNumber = zonedParts(date).day;

                            return (
                                <button
                                    key={cell.id}
                                    type="button"
                                    className={[
                                        "mini__day",
                                        cell.inMonth ? null : "mini__day--out",
                                        isAnchor ? "mini__day--anchor" : null,
                                        isToday ? "mini__day--today" : null,
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    // The dot and the today ring are visual only, so the name
                                    // says what they do.
                                    aria-label={[
                                        formatLongDay(date),
                                        isToday ? "today" : null,
                                        countEvents(cell.events.length),
                                    ]
                                        .filter(Boolean)
                                        .join(", ")}
                                    aria-current={isAnchor ? "date" : undefined}
                                    onClick={() => onPickDay(date)}
                                >
                                    <span className="mini__day-number">{dayNumber}</span>
                                    {hasEvents && (
                                        <span
                                            aria-hidden="true"
                                            className="mini__dot"
                                            style={{ backgroundColor: colorForLabels(cell.events[0].labels) }}
                                        />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>
        </>
    );
}

export default MonthDays;
