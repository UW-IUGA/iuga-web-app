import { formatFullDate } from "../../utils/calendar/calendar";
import useZoomOverlay from "../../hooks/useZoomOverlay";
import Card from "./Card";
import DayOverlay from "./DayOverlay";

// Shows a compact month whose event days open an animated detail overlay
// without leaving the year view.
function YearCard({ title, rows, onPickDay, isCurrentMonth = false }) {
    const { open: selectedDay, openFrom, close, onKeyDown, contentRef, backRef } = useZoomOverlay();
    const isDayOverlayOpen = Boolean(selectedDay);

    // The compact pad is already painted with the day's label colour, so it
    // grows as it is.
    const openDay = (date, cell, dayButton) => {
        if (cell.events.length > 0) {
            openFrom(dayButton, { date, cell });
        }
    };

    return (
        <Card
            title={title}
            rows={rows}
            onPickDay={openDay}
            compact
            isCurrentMonth={isCurrentMonth}
            className={isDayOverlayOpen ? "card--open" : null}
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
