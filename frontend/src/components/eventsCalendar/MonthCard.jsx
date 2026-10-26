import { useState } from "react";
import Card from "./Card";
import EventPopover from "./EventPopover";

// The month view's card. An event chip opens that event in a popover beside
// it, the same popover the week view uses: Sunday's opens to the right, into
// the month, and every other day's to the left, which keeps it off the
// window's right edge. "+N more" opens the whole day in it. Clicking anywhere
// else in a day still goes to the day view, as does "View day" from inside
// the popover.
function MonthCard({ title, rows, onPickDay }) {
    const [selected, setSelected] = useState(null);

    // Stepping to another month unmounts the chip the popover is anchored to, so
    // the selection is dropped with it, during render so no frame shows it over
    // a month that is gone. Keyed by the title, which names the month.
    if (selected && selected.month !== title) setSelected(null);
    const open = selected?.month === title ? selected : null;

    const pickEvent = ({ cell, event, columnIndex, key, el }) => {
        // Already open beside this chip: leave it be rather than replaying it.
        if (open?.key === key) return;
        setSelected({
            events: event ? [event] : cell.events,
            date: cell.date,
            key,
            el,
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
                onPickEvent={pickEvent}
                openEventKey={open?.key ?? null}
                className="card--month"
            />
            <EventPopover selected={open} onClose={() => setSelected(null)} onViewDay={onPickDay} />
        </>
    );
}

export default MonthCard;
