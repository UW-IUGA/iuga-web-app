import { colorForLabels, countEvents, formatLongDay, isSameDay, WEEKDAY_ABBREVIATIONS } from "../../utils/calendar/calendar";

// Displays a month's dates and events, either as a full calendar or a
// compact card in the year view. Reports date and event selections to
// its parent, which controls navigation and the event popover.
function Card({
    title,
    rows,
    onPickDay,
    onPickEvent,
    openEventKey = null,
    compact = false,
    isCurrentMonth = false,
    className,
    isDayOverlayOpen = false,
    children,
}) {
    const today = new Date();
    const cardClasses = ["card"];

    if (compact) {
        cardClasses.push("card--compact");
    }

    if (isCurrentMonth) {
        cardClasses.push("card--current");
    }

    if (className) {
        cardClasses.push(className);
    }

    return (
        <div className={cardClasses.join(" ")} aria-current={isCurrentMonth ? "date" : undefined}>
            {children}

            {/* While an overlay covers the grid, exclude it from keyboard
                navigation and the accessibility tree. */}
            <div className="card-grid" inert={isDayOverlayOpen ? "" : undefined}>
                {/* A heading, so a screen reader can move month to month in the year
            view the same way a sighted reader scans the titles. */}
                <div className="card-title">
                    <h2 className="card-title__heading">
                        {title}
                        {/* The outline is visual only, and aria-current on a card is not
                announced by every screen reader, so the heading says it too. */}
                        {isCurrentMonth && <span className="sr-only">, this month</span>}
                    </h2>
                </div>

                <div className="row weekday-header" aria-hidden="true">
                    {WEEKDAY_ABBREVIATIONS.map((label) => (
                        <span key={label}>{label}</span>
                    ))}
                </div>

                {rows.map((row) => (
                    <div className="row" key={row[0].id}>
                        {row.map((cell, columnIndex) => {
                            const hasEvents = cell.events.length > 0;

                            // Event chips do not fit in the year view, so event days
                            // use the first event's label colour instead.
                            const showsEventColor = compact && hasEvents;

                            // A compact day with nothing in it has nothing to open, so it is
                            // not a stop on the way through the year with a keyboard.
                            const isEmptyCompactDay = compact && !hasEvents;

                            // Circled in the month view, as the week view's header circles it.
                            // The year view's squares are too small to hold a circle.
                            const isToday = !compact && isSameDay(cell.date, today);

                            const dayClasses = ["pad"];

                            if (!cell.inMonth) {
                                dayClasses.push("pad--out");
                            }

                            if (showsEventColor) {
                                dayClasses.push("pad--event");
                            }

                            if (isToday) {
                                dayClasses.push("pad--today");
                            }

                            // The cell shows only a number, and the weekday header and month
                            // title are out of reach once focus is inside the grid, so the
                            // name carries all three plus what is on the day. Spill cells
                            // name their real date: they are clickable through to it, and
                            // the number they would otherwise print (0 or negative) is not
                            // a date at all.
                            // "today" is in the name too: the circle is visual only.
                            const dayAnnouncements = [formatLongDay(cell.date)];

                            if (isToday) {
                                dayAnnouncements.push("today");
                            }

                            dayAnnouncements.push(countEvents(cell.events.length));
                            const dayLabel = dayAnnouncements.join(", ");

                            // A spill cell's day number is 0 or negative. Rendering it would
                            // print a date that does not exist.
                            const dayNumber = cell.inMonth && <span className="pad__day">{cell.day}</span>;

                            if (compact) {
                                return (
                                    <button
                                        key={cell.id}
                                        type="button"
                                        disabled={isEmptyCompactDay}
                                        className={dayClasses.join(" ")}
                                        aria-label={dayLabel}
                                        style={
                                            showsEventColor
                                                ? { backgroundColor: colorForLabels(cell.events[0].labels) }
                                                : undefined
                                        }
                                        onClick={(event) => onPickDay(cell.date, cell, event.currentTarget)}
                                    >
                                        {dayNumber}
                                    </button>
                                );
                            }

                            // Keep event buttons beside the day button: HTML forbids nested
                            // buttons. The day button fills the cell behind the chips.
                            //
                            // `event` is null for "+N more", which opens the whole day.
                            // `columnIndex` is the weekday, Sunday first.
                            const getEventChipKey = (event) => `${cell.id}|${event ? event.id : "more"}`;
                            const getEventChipProps = (event) => ({
                                type: "button",
                                "data-popover-trigger": "",
                                "aria-haspopup": "dialog",
                                "aria-expanded": openEventKey === getEventChipKey(event),
                                onClick: (clickEvent) =>
                                    onPickEvent?.({
                                        cell,
                                        event,
                                        columnIndex,
                                        key: getEventChipKey(event),
                                        el: clickEvent.currentTarget,
                                    }),
                            });

                            return (
                                <div key={cell.id} className={dayClasses.join(" ")}>
                                    <button
                                        type="button"
                                        className="pad__open"
                                        aria-label={dayLabel}
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
                                                    // The name is cut off with an ellipsis when it is
                                                    // longer than the day is wide. The tooltip shows it
                                                    // whole to a mouse; a screen reader already reads
                                                    // the full text.
                                                    title={event.name}
                                                >
                                                    {event.name}
                                                </button>
                                            ))}
                                            {cell.events.length > 3 && (
                                                <button
                                                    {...getEventChipProps(null)}
                                                    className="pad__more"
                                                    // Says what is behind it and which day, where the
                                                    // visible "+2 more" says neither. Starts with the
                                                    // visible text, so speaking it still works (2.5.3).
                                                    aria-label={`+${cell.events.length - 3} more events on ${formatLongDay(cell.date)}`}
                                                >
                                                    +{cell.events.length - 3} more
                                                </button>
                                            )}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default Card;
