import { useEffect, useMemo, useRef } from "react";
import useNow from "../../hooks/useNow";
import { colorForLabels, formatClockTime, formatWeekday, overlapBox, zonedParts } from "../../utils/calendar/calendar";

// Where to land when the view opens somewhere other than today. Mid-morning
// shows a populated stretch rather than six empty hours above it.
const DEFAULT_SCROLL_HOUR = 7;

// In pixels, so it has to agree with _time-grid.scss.
const HOUR_HEIGHT = 48;

const HOURS = Array.from({ length: 24 }, (_, index) => index);

// Derived from the hour index rather than a Date, so the gutter labels cannot
// drift by an hour across a DST transition.
function hourLabel(hour) {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
}

/**
 * The scrolling time grid. Takes ready-built day columns, so the week and day
 * views are the same component with a different column count.
 *
 * With `onPickEvent`, each event is a button reporting
 * `{ event, date, columnIndex, el }` when pressed — the week view opens it in
 * a popover. Without it, events are plain cards (the day view lists their
 * detail beside the grid instead).
 *
 * `openEventKey` marks the event whose popover is open, for aria-expanded.
 *
 * With `onPickColumn`, a press anywhere in a day's column reports that day,
 * and a press on an event passes through to it. The week view sets it on a
 * phone, where overlapping events split a ~40px column into blocks under the
 * 24px minimum target (WCAG 2.5.8); the column is the one target under a
 * finger there. The events stay buttons, so a keyboard or screen reader still
 * opens each one, and the day's header is the keyboard's way to the day.
 *
 * @param {{
 *   columns: Array,
 *   onSelectDay: (date: Date) => void,
 *   onPickEvent?: (pick: object) => void,
 *   openEventKey?: string | null,
 *   onPickColumn?: (date: Date) => void,
 * }} props
 */
function TimeGrid({ columns, onSelectDay, onPickEvent, openEventKey = null, onPickColumn }) {
    const scrollRef = useRef(null);
    const now = useNow();
    const nowParts = zonedParts(now);

    const nowFraction = ((nowParts.hour * 60 + nowParts.minute) / 1440) * 100;
    const anyToday = useMemo(() => columns.some((column) => column.isToday), [columns]);

    // Run once on mount. Re-running per anchor change would yank the scroll
    // position away from wherever the viewer has moved to.
    useEffect(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        scroller.scrollTop = (anyToday ? Math.max(nowParts.hour - 2, 0) : DEFAULT_SCROLL_HOUR) * HOUR_HEIGHT;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={`grid${onPickColumn ? " grid--tap-days" : ""}`} style={{ "--grid-cols": columns.length }}>
            {/* Scrolls on its own, and the day headers inside it stay stuck at the
          top, so focusing them never moves it: without a tab stop of its own a
          keyboard could not scroll the day view (WCAG 2.1.1). Focused, the
          arrow keys and Page Up / Down move through the day. */}
            <div className="grid__scroll" ref={scrollRef} tabIndex={0} role="region" aria-label="Schedule">
                {/* Inside the scroller, stuck to its top, rather than above it. Above
            it, the head kept the full width while a scrollbar took its share
            from the days alone, so the columns slid out from under their
            weekdays. In here both share one width, scrollbar or none. */}
                <div className="grid__head">
                    <div className="grid__gutter-head" aria-hidden="true" />
                    {columns.map((column) => (
                        <button
                            type="button"
                            key={column.key}
                            className={`grid__dayhead${column.isToday ? " grid__dayhead--today" : ""}`}
                            aria-current={column.isToday ? "date" : undefined}
                            onClick={() => onSelectDay(column.date)}
                        >
                            <span className="grid__dayhead-name">{formatWeekday(column.date)}</span>
                            <span className="grid__dayhead-number">{column.parts.day}</span>
                        </button>
                    ))}
                </div>

                <div className="grid__body">
                    <div className="grid__gutter" aria-hidden="true">
                        {HOURS.map((hour) => (
                            <div className="grid__gutter-cell" key={hour}>
                                {hour !== 0 && <span>{hourLabel(hour)}</span>}
                            </div>
                        ))}
                    </div>

                    {columns.map((column, columnIndex) => (
                        // A pointer shortcut only: the day header above is the same
                        // action for a keyboard, so the column is not a second tab stop.
                        <div
                            className="grid__col"
                            key={column.key}
                            onClick={onPickColumn ? () => onPickColumn(column.date) : undefined}
                        >
                            {HOURS.map((hour) => (
                                <div className="grid__hour" key={hour} />
                            ))}

                            {column.isToday && (
                                <div className="grid__now" style={{ top: `${nowFraction}%` }}>
                                    <span className="grid__now-dot" />
                                </div>
                            )}

                            {column.events.map((item) => {
                                const box = overlapBox(item.columnIndex, item.columnCount);
                                const key = `${item.event.id}-${item.startMinutes}`;
                                const Event = onPickEvent ? "button" : "div";
                                const interactive = onPickEvent
                                    ? {
                                          type: "button",
                                          "data-popover-trigger": "",
                                          "aria-haspopup": "dialog",
                                          "aria-expanded": openEventKey === `${column.key}|${key}`,
                                          onClick: (click) =>
                                              onPickEvent({
                                                  event: item.event,
                                                  date: column.date,
                                                  columnIndex,
                                                  key: `${column.key}|${key}`,
                                                  el: click.currentTarget,
                                              }),
                                      }
                                    : {};

                                return (
                                    <Event
                                        key={key}
                                        className={`grid__event${onPickEvent ? " grid__event--button" : ""}`}
                                        {...interactive}
                                        style={{
                                            top: `${item.top}%`,
                                            height: `${item.height}%`,
                                            // A pixel in from each side, so the event never touches
                                            // the day's borders.
                                            left: `calc(${box.left}% + 1px)`,
                                            width: `calc(${box.width}% - 2px)`,
                                            zIndex: 2 + box.layer,
                                            backgroundColor: colorForLabels(item.event.labels),
                                        }}
                                    >
                                        {/* Spans, not paragraphs: a button may only hold phrasing
                        content. */}
                                        <span className="grid__event-name">{item.event.name}</span>
                                        <span className="grid__event-time">{formatClockTime(item.event.start)}</span>
                                    </Event>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default TimeGrid;
