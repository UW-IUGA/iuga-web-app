import { colorForLabels, dayLabel, formatFullDate } from "../../utils/calendar/calendar";
import useZoomOverlay from "../../hooks/useZoomOverlay";
import Card from "./Card";
import DayOverlay from "./DayOverlay";

// Shows a compact month whose event days open an animated detail overlay
// without leaving the year view.
function YearCard({ title, rows, onPickDay, isCurrentMonth = false }) {
    const { open: selectedDay, openFrom, close, onKeyDown, contentRef, backRef } = useZoomOverlay();
    const isDayOverlayOpen = Boolean(selectedDay);

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
                style={hasEvents ? { backgroundColor: colorForLabels(cell.events[0].labels) } : undefined}
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
            className={isDayOverlayOpen ? "card--compact card--open" : "card--compact"}
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
