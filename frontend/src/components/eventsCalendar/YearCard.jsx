import { useContext } from "react";
import { colorForLabels, dayLabel, formatFullDate } from "../../utils/calendar/calendar";
import { FilterRevealContext } from "../../hooks/useFilterReveal";
import useZoomOverlay from "../../hooks/useZoomOverlay";
import Card from "./Card";
import DayOverlay from "./DayOverlay";
import { entranceIndexStyle } from "../../utils/calendar/motion";

// Shows a compact month whose event days open an animated detail overlay
// without leaving the year view.
function YearCard({ title, rows, onPickDay, isCurrentMonth = false, revealing = false, style }) {
    const { isEvent } = useContext(FilterRevealContext);
    const { open: selectedDay, openFrom, close, onKeyDown, contentRef, backRef } = useZoomOverlay();
    const isDayOverlayOpen = Boolean(selectedDay);

    const eventDayIndexById = (() => {
        const map = new Map();
        let index = 0;
        for (const row of rows) {
            for (const cell of row) {
                if (cell.events.length > 0) {
                    map.set(cell.id, index);
                    index += 1;
                }
            }
        }
        return map;
    })();

    // The pad is already painted with the day's label colour, so it grows as it is.
    const openDay = (date, cell, dayButton) => {
        if (cell.events.length > 0) {
            openFrom(dayButton, { date, cell });
        }
    };

    const renderDay = (cell) => {
        const hasEvents = cell.events.length > 0;

        const dayClasses = ["pad"];

        if (!cell.inMonth) {
            dayClasses.push("pad--out");
        }

        if (hasEvents) {
            dayClasses.push("pad--event");
            // Only when this day just gained its first visible event. A day
            // that already had another tag stays still.
            if (cell.events.every((event) => event.id && isEvent(event.id))) {
                dayClasses.push("pad--event--filter-reveal");
            }
        }

        const dayNumber = cell.inMonth && <span className="pad__day">{cell.day}</span>;

        // A day with nothing in it has nothing to open, so it is not a stop on the
        // way through the year with a keyboard.
        return (
            <button
                type="button"
                disabled={!hasEvents}
                className={dayClasses.join(" ")}
                aria-label={dayLabel(cell.date, cell.events.length)}
                style={hasEvents ? entranceIndexStyle(eventDayIndexById.get(cell.id), { backgroundColor: colorForLabels(cell.events[0].labels) }) : undefined}
                onClick={(event) => openDay(cell.date, cell, event.currentTarget)}
            >
                {dayNumber}
            </button>
        );
    };

    return (
        <Card
            title={title}
            rows={rows}
            renderDay={renderDay}
            style={style}
            className={`card--compact${isDayOverlayOpen ? " card--open" : ""}${revealing ? " card--filter-reveal" : ""}`}
            isCurrentMonth={isCurrentMonth}
            isDayOverlayOpen={isDayOverlayOpen}
        >
            <DayOverlay
                isOpen={isDayOverlayOpen}
                contentRef={contentRef}
                backRef={backRef}
                onBack={close}
                onKeyDown={onKeyDown}
                heading={selectedDay && formatFullDate(selectedDay.date)}
                events={selectedDay ? selectedDay.cell.events : []}
                onViewDay={() => onPickDay(selectedDay.date)}
            />
        </Card>
    );
}

export default YearCard;
