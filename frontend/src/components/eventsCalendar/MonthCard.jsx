import { useState } from "react";
import { colorForLabels, dayLabel, formatLongDay, isSameDay } from "../../utils/calendar/calendar";
import Card from "./Card";
import EventPopover from "./EventPopover";

// Shows a full month with event popovers. Event chips open one event;
// "+N more" opens the day's events. The day button navigates to the day view.
function MonthCard({ title, rows, onPickDay }) {
    const [popoverSelection, setPopoverSelection] = useState(null);
    const today = new Date();

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

    // Keep event buttons beside the day button: HTML forbids nested buttons. The
    // day button fills the cell behind the chips.
    const renderDay = (cell, columnIndex) => {
        const hasEvents = cell.events.length > 0;

        // Circled in the month view, as the week view's header circles it.
        const isToday = isSameDay(cell.date, today);

        const dayClasses = ["pad"];

        if (!cell.inMonth) {
            dayClasses.push("pad--out");
        }

        if (isToday) {
            dayClasses.push("pad--today");
        }

        // The cell shows only a number, and the weekday header and month title are
        // out of reach once focus is inside the grid, so the name carries all three
        // plus what is on the day. Spill cells name their real date: they are
        // clickable through to it. "today" is in the name too: the circle is visual only.
        const label = dayLabel(cell.date, cell.events.length, isToday);

        // A spill cell's day number is 0 or negative. Rendering it would print a
        // date that does not exist.
        const dayNumber = cell.inMonth && <span className="pad__day">{cell.day}</span>;

        // `event` is null for "+N more", which opens the whole day.
        const getEventChipKey = (event) => `${cell.id}|${event ? event.id : "more"}`;
        const getEventChipProps = (event) => ({
            type: "button",
            "data-popover-trigger": "",
            "aria-haspopup": "dialog",
            "aria-expanded": currentMonthSelection?.key === getEventChipKey(event),
            onClick: (clickEvent) =>
                openEventPopover({
                    cell,
                    event,
                    columnIndex,
                    key: getEventChipKey(event),
                    el: clickEvent.currentTarget,
                }),
        });

        return (
            <div className={dayClasses.join(" ")}>
                <button
                    type="button"
                    className="pad__open"
                    aria-label={label}
                    aria-current={isToday ? "date" : undefined}
                    onClick={(event) => onPickDay(cell.date, cell, event.currentTarget)}
                >
                    {dayNumber}
                </button>

                {hasEvents && (
                    <span className="pad__events">
                        {cell.events.slice(0, 3).map((event) => (
                            <button
                                {...getEventChipProps(event)}
                                className="pad__event"
                                key={event.id}
                                style={{ backgroundColor: colorForLabels(event.labels) }}
                                // The name is cut off with an ellipsis when it is longer than the
                                // day is wide. The tooltip shows it whole to a mouse; a screen
                                // reader already reads the full text.
                                title={event.name}
                            >
                                {event.name}
                            </button>
                        ))}
                        {cell.events.length > 3 && (
                            <button
                                {...getEventChipProps(null)}
                                className="pad__more"
                                // Says what is behind it and which day, where the visible "+2 more"
                                // says neither. Starts with the visible text, so speaking it still
                                // works (2.5.3).
                                aria-label={`+${cell.events.length - 3} more events on ${formatLongDay(cell.date)}`}
                            >
                                +{cell.events.length - 3} more
                            </button>
                        )}
                    </span>
                )}
            </div>
        );
    };

    return (
        <>
            <Card title={title} rows={rows} renderDay={renderDay} className="card--month" />
            <EventPopover
                selected={currentMonthSelection}
                onClose={() => setPopoverSelection(null)}
                onViewDay={onPickDay}
            />
        </>
    );
}

export default MonthCard;
