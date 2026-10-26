import { colorForLabels, countEvents, formatLongDay, isSameDay, WEEKDAY_SHORT } from "../../utils/calendar/calendar";

// The large month grid. A day navigates to the day view; an event chip inside
// it is a control of its own and reports through `onPickEvent`, which the
// month card uses to open that event in a popover beside it. Both are real
// buttons, so the chips sit beside the day's button rather than inside it — a
// button cannot hold another.
//
// `openEventKey` names the chip whose popover is open, for aria-expanded.
//
// `isCurrent` marks the month that holds today. The year view outlines its
// card; a screen reader hears it from aria-current and the heading.
//
// `compact` is the year view's variant. Many months share the page, so each
// pad is too small to hold a readable chip: the month keeps only the day
// numbers, and the pad itself is painted with the first event's label colour
// to carry what the chips would have said.
//
// `children` render inside the card, over the grid. The year card uses it for
// the overlay that opens a day in place, and `gridInert` takes the grid out of
// the tab order and the accessibility tree while that overlay covers it.
function Card({
    title,
    rows,
    onPickDay,
    onPickEvent,
    openEventKey = null,
    compact = false,
    isCurrent = false,
    className,
    gridInert = false,
    children,
}) {
    const today = new Date();

    return (
        <div
            className={["card", compact ? "card--compact" : null, isCurrent ? "card--current" : null, className]
                .filter(Boolean)
                .join(" ")}
            aria-current={isCurrent ? "date" : undefined}
        >
            {children}

            <div className="card-grid" inert={gridInert ? "" : undefined}>
                {/* A heading, so a screen reader can move month to month in the year
            view the same way a sighted reader scans the titles. */}
                <div className="card-title">
                    <h2 className="card-title__heading">
                        {title}
                        {/* The outline is visual only, and aria-current on a card is not
                announced by every screen reader, so the heading says it too. */}
                        {isCurrent && <span className="sr-only">, this month</span>}
                    </h2>
                </div>

                <div className="row row--header" aria-hidden="true">
                    {WEEKDAY_SHORT.map((label) => (
                        <span key={label}>{label}</span>
                    ))}
                </div>

                {rows.map((row) => (
                    <div className="row" key={row[0].id}>
                        {row.map((cell, columnIndex) => {
                            const hasEvents = cell.events.length > 0;

                            // A painted pad is how the compact grid carries label colour. At
                            // this size a chip is illegible, so the cell itself takes the
                            // first event's colour — which is what the original card did
                            // before chips were introduced.
                            const painted = compact && hasEvents;

                            // A compact day with nothing in it has nothing to open, so it is
                            // not a stop on the way through the year with a keyboard.
                            const empty = compact && !hasEvents;

                            // Circled in the month view, as the week view's header circles it.
                            // The year view's squares are too small to hold a circle.
                            const isToday = !compact && isSameDay(cell.date, today);

                            const classes = [
                                "pad",
                                cell.inMonth ? null : "pad--out",
                                painted ? "pad--event" : null,
                                isToday ? "pad--today" : null,
                            ]
                                .filter(Boolean)
                                .join(" ");

                            // The cell shows only a number, and the weekday header and month
                            // title are out of reach once focus is inside the grid, so the
                            // name carries all three plus what is on the day. Spill cells
                            // name their real date: they are clickable through to it, and
                            // the number they would otherwise print (0 or negative) is not
                            // a date at all.
                            // "today" is in the name too: the circle is visual only.
                            const label = [
                                formatLongDay(cell.date),
                                isToday ? "today" : null,
                                countEvents(cell.events.length),
                            ]
                                .filter(Boolean)
                                .join(", ");

                            // A spill cell's day number is 0 or negative. Rendering it would
                            // print a date that does not exist.
                            const dayNumber = cell.inMonth && <span className="pad__day">{cell.day}</span>;

                            if (compact) {
                                return (
                                    <button
                                        key={cell.id}
                                        type="button"
                                        disabled={empty}
                                        className={classes}
                                        aria-label={label}
                                        style={
                                            painted
                                                ? { backgroundColor: colorForLabels(cell.events[0].labels) }
                                                : undefined
                                        }
                                        onClick={(event) => onPickDay(cell.date, cell, event.currentTarget)}
                                    >
                                        {dayNumber}
                                    </button>
                                );
                            }

                            // The full-size day. Its button fills the cell behind the chips,
                            // so a click anywhere a chip is not still opens the day.
                            //
                            // `event` is null for "+N more", which opens the whole day.
                            // `columnIndex` is the weekday, Sunday first.
                            const chipKey = (event) => `${cell.id}|${event ? event.id : "more"}`;
                            const chip = (event) => ({
                                type: "button",
                                "data-popover-trigger": "",
                                "aria-haspopup": "dialog",
                                "aria-expanded": openEventKey === chipKey(event),
                                onClick: (click) =>
                                    onPickEvent?.({
                                        cell,
                                        event,
                                        columnIndex,
                                        key: chipKey(event),
                                        el: click.currentTarget,
                                    }),
                            });

                            return (
                                <div key={cell.id} className={classes}>
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
                                                    {...chip(event)}
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
                                                    {...chip(null)}
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
