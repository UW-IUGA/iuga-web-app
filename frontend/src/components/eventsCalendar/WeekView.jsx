import { useMemo, useState } from "react";
import useMediaQuery from "../../hooks/useMediaQuery";
import { MOBILE_QUERY } from "../../utils/calendar/breakpoints";
import { buildDayColumns, buildWeekDates } from "../../utils/calendar/calendar";
import EventPopover from "./EventPopover";
import TimeGrid from "./TimeGrid";

// A week is the time grid fed seven dates. Clicking an event opens its detail
// in a popover beside it; Sunday's opens to the right, into the week, and every
// other day's opens left, which keeps the popover off the window's right edge.
function WeekView({ anchor, events, onSelectDay }) {
    const columns = useMemo(() => buildDayColumns(buildWeekDates(anchor), events), [anchor, events]);

    const [selected, setSelected] = useState(null);

    // On a phone a day's column is the target, as a month's day is: a tap goes
    // to that day, where each event has the full width (see TimeGrid).
    const tapDays = useMediaQuery(MOBILE_QUERY);

    // Stepping to another week unmounts the event the popover is anchored to,
    // so the selection is dropped with it. Dropped rather than merely hidden:
    // stepping back would otherwise bring it back beside an element that is no
    // longer in the page. Reset during render, not in an effect, so no frame
    // shows a popover for a week that is gone.
    const weekKey = columns[0].key;
    if (selected && selected.weekKey !== weekKey) setSelected(null);
    const open = selected?.weekKey === weekKey ? selected : null;

    const pickEvent = ({ event, date, columnIndex, key, el }) => {
        // Already open beside this event: leave it be rather than replaying it.
        if (open?.key === key) return;
        setSelected({
            events: [event],
            date,
            key,
            el,
            weekKey,
            // Week dates start on Sunday (WEEK_STARTS_ON), so column 0 is Sunday.
            side: columnIndex === 0 ? "right" : "left",
        });
    };

    return (
        <>
            <TimeGrid
                columns={columns}
                onSelectDay={onSelectDay}
                onPickEvent={pickEvent}
                openEventKey={open?.key ?? null}
                onPickColumn={tapDays ? onSelectDay : undefined}
            />
            <EventPopover selected={open} onClose={() => setSelected(null)} onViewDay={onSelectDay} />
        </>
    );
}

export default WeekView;
