import { formatFullDate } from "../../utils/calendar/calendar";
import useZoomOverlay from "../../hooks/useZoomOverlay";
import Card from "./Card";
import DayOverlay from "./DayOverlay";

// One month in the year view. A day with events opens in place, the way the
// original events page did: the pad grows until its label colour fills the
// card, then the day's events rise in over it. The rest of the year stays on
// screen around it, which is the point of opening here rather than jumping to
// the day view — though "View day" is there for that too.
function YearCard({ title, rows, onPickDay, isCurrent = false }) {
    const { open, openFrom, close, onKeyDown, contentRef, backRef } = useZoomOverlay();

    // The compact pad is already painted with the day's label colour, so it
    // grows as it is.
    const openDay = (date, cell, el) => {
        if (cell.events.length) openFrom(el, { date, cell });
    };

    return (
        <Card
            title={title}
            rows={rows}
            onPickDay={openDay}
            compact
            isCurrent={isCurrent}
            className={open ? "card--open" : null}
            gridInert={Boolean(open)}
        >
            <DayOverlay
                isOpen={Boolean(open)}
                contentRef={contentRef}
                backRef={backRef}
                onBack={close}
                onKeyDown={onKeyDown}
                heading={open && formatFullDate(open.date)}
                events={open ? open.cell.events : []}
                onViewDay={() => onPickDay(open.date)}
            />
        </Card>
    );
}

export default YearCard;
