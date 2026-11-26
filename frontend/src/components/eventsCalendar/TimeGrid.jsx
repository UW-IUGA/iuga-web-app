import { useContext, useLayoutEffect, useMemo, useRef } from "react";
import { EntranceWaveContext } from "../../hooks/useEntranceWave";
import useNow from "../../hooks/useNow";
import { colorForLabels, formatClockTime, formatWeekday, overlapBox, zonedParts } from "../../utils/calendar/calendar";
import { firstEvent, scrollTopFor } from "../../utils/calendar/gridScroll";
import { entranceIndexStyle } from "../../utils/calendar/motion";

// Where to land on a day or week with no events, other than today.
// Mid-morning shows a likely stretch rather than six empty hours above it.
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
 * views share one component with a different column count. Event and column
 * presses are reported to the caller; the selected event stays the caller's.
 */
function TimeGrid({ columns, onPickEvent, openEventKey = null, onPickColumn }) {
    const { isEvent } = useContext(EntranceWaveContext);
    const scrollRef = useRef(null);
    const now = useNow();
    const nowParts = zonedParts(now);

    const nowFraction = ((nowParts.hour * 60 + nowParts.minute) / 1440) * 100;
    const anyToday = useMemo(() => columns.some((column) => column.isToday), [columns]);

    // Left to right by day, then top to bottom in the day, for the entrance stagger.
    const entranceIndexByKey = useMemo(() => {
        const map = new Map();
        let index = 0;
        for (const column of columns) {
            for (const item of column.events) {
                map.set(`${item.event.id}-${item.startMinutes}`, index);
                index += 1;
            }
        }
        return map;
    }, [columns]);

    // Each day or week opens with its first event at the top, so nobody has to
    // scroll to find what is on. With no events it opens two hours before now
    // for today, or mid-morning. Keyed by the days shown rather than the
    // columns' identity, so a date picked inside the same week does not move
    // the view out from under the viewer. The first event's start is in the key
    // too: the grid is up while the event list loads, so it lands again once the
    // events arrive, but a reload of the same list leaves it alone. Before paint,
    // so it never flashes at midnight first.
    const first = firstEvent(columns);
    const scrollKey = `${columns.map((column) => column.key).join()}|${first?.startMinutes ?? ""}`;
    useLayoutEffect(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        scroller.scrollTop = first
            ? scrollTopFor(first, HOUR_HEIGHT)
            : (anyToday ? Math.max(nowParts.hour - 2, 0) : DEFAULT_SCROLL_HOUR) * HOUR_HEIGHT;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scrollKey]);

    return (
        <div className={`grid${onPickColumn ? " grid--tap-days" : ""}`} style={{ "--grid-cols": columns.length }}>
            {/* Scrolls on its own, with the day headers stuck to its top. It has a tab
          stop of its own: in a day with no events there is nothing else to focus,
          and without one a keyboard could not scroll it (WCAG 2.1.1). Focused, the
          arrow keys and Page Up / Down move through the day. */}
            <div className="grid__scroll" ref={scrollRef} tabIndex={0} role="region" aria-label="Schedule">
                {/* Inside the scroller, stuck to its top, rather than above it. Above
            it, the head kept the full width while a scrollbar took its share
            from the days alone, so the columns slid out from under their
            weekdays. In here both share one width, scrollbar or none. */}
                <div className="grid__head">
                    <div className="grid__gutter-head" aria-hidden="true" />
                    {/* Labels, not controls: a click on a weekday leaves the view where
              it is. The event popover's View day, the view switch and the date
              picker are the ways to a day. */}
                    {columns.map((column) => (
                        <div
                            key={column.key}
                            className={`grid__dayhead${column.isToday ? " grid__dayhead--today" : ""}`}
                            aria-current={column.isToday ? "date" : undefined}
                        >
                            <span className="grid__dayhead-name">{formatWeekday(column.date)}</span>
                            <span className="grid__dayhead-number">{column.parts.day}</span>
                        </div>
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
                        // On a phone, a press on a day's empty space goes to the day; a
                        // press on an event still opens it. A pointer shortcut only, so
                        // not a tab stop: a keyboard reaches the day from an event's View
                        // day, the view switch or the date picker.
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
                                const eventButtonProps = onPickEvent
                                    ? {
                                          type: "button",
                                          "data-popover-trigger": "",
                                          "aria-haspopup": "dialog",
                                          "aria-expanded": openEventKey === `${column.key}|${key}`,
                                          onClick: (click) => {
                                              // The event, not the day: keep it from the
                                              // column's tap-to-day beneath.
                                              click.stopPropagation();
                                              onPickEvent({
                                                  event: item.event,
                                                  date: column.date,
                                                  columnIndex,
                                                  key: `${column.key}|${key}`,
                                                  el: click.currentTarget,
                                              });
                                          },
                                      }
                                    : {};

                                return (
                                    <Event
                                        key={key}
                                        className={`grid__event${onPickEvent ? " grid__event--button" : ""}${isEvent(item.event.id) ? " grid__event--enter" : ""}`}
                                        {...eventButtonProps}
                                        style={entranceIndexStyle(entranceIndexByKey.get(key), {
                                            top: `${item.top}%`,
                                            height: `${item.height}%`,
                                            // A pixel in from each side, so the event never touches
                                            // the day's borders.
                                            left: `calc(${box.left}% + 1px)`,
                                            width: `calc(${box.width}% - 2px)`,
                                            zIndex: 2 + box.layer,
                                            backgroundColor: colorForLabels(item.event.labels),
                                        })}
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
