import { useId, useMemo } from "react";
import { buildDayColumns, formatFullDate } from "../../utils/calendar/calendar";
import TimeGrid from "./TimeGrid";
import EventDetail from "./EventDetail";

// A day is the time grid fed one date, plus a list carrying the full detail
// for each event. The grid card is sized by duration and cannot hold a
// description, location and RSVP block, so the detail lives beside it rather
// than being squeezed into the timeline.
function DayView({ anchor, events, onSelectDay }) {
    const columns = useMemo(() => buildDayColumns([anchor], events), [anchor, events]);
    const day = columns[0];
    const headingId = useId();

    return (
        <div className="day">
            <TimeGrid columns={columns} onSelectDay={onSelectDay} />

            {/* Named by its heading, which is the day itself. It used to read the
          month, which said less than the toolbar above it. */}
            <section className="day__agenda" aria-labelledby={headingId}>
                <h2 id={headingId} className="day__agenda-title">
                    {formatFullDate(day.date)}
                </h2>

                {day.events.length === 0 ? (
                    <p className="day__empty">Nothing scheduled.</p>
                ) : (
                    day.events.map((item) => (
                        <EventDetail key={`${item.event.id}-${item.startMinutes}`} event={item.event} />
                    ))
                )}
            </section>
        </div>
    );
}

export default DayView;
