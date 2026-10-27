import { useState } from "react";
import Card from "./Card";
import EventPopover from "./EventPopover";

// Shows a full month with event popovers. Event chips open one event;
// "+N more" opens the day's events. The day button navigates to the day view.
function MonthCard({ title, rows, onPickDay }) {
    const [popoverSelection, setPopoverSelection] = useState(null);

    // Stepping to another month unmounts the chip the popover is anchored to, so
    // the selection is dropped with it, during render so no frame shows it over
    // a month that is gone. Keyed by the title, which names the month.
    if (popoverSelection && popoverSelection.month !== title) {
        setPopoverSelection(null);
    }
    const currentMonthSelection = popoverSelection?.month === title ? popoverSelection : null;

    const openEventPopover = ({ cell, event, columnIndex, key, el: triggerElement }) => {
        // Already open beside this chip: leave it be rather than replaying it.
        if (currentMonthSelection?.key === key) {
            return;
        }

        setPopoverSelection({
            events: event ? [event] : cell.events,
            date: cell.date,
            key,
            el: triggerElement,
            month: title,
            side: columnIndex === 0 ? "right" : "left",
        });
    };

    return (
        <>
            <Card
                title={title}
                rows={rows}
                onPickDay={onPickDay}
                onPickEvent={openEventPopover}
                openEventKey={currentMonthSelection?.key ?? null}
                className="card--month"
            />
            <EventPopover
                selected={currentMonthSelection}
                onClose={() => setPopoverSelection(null)}
                onViewDay={onPickDay}
            />
        </>
    );
}

export default MonthCard;
