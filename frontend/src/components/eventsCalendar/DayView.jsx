import { useMemo } from "react";
import useEventPopover from "../../hooks/useEventPopover";
import { buildDayColumns } from "../../utils/calendar/calendar";
import EventPopover from "./EventPopover";
import TimeGrid from "./TimeGrid";

// A day is the time grid fed one date. Clicking an event opens its details in the
// same popover week view uses. The day is already on screen, so that popover has
// no "View day" button.
function DayView({ anchor, events, onSelectDay }) {
    const columns = useMemo(() => buildDayColumns([anchor], events), [anchor, events]);
    const { popoverSelection, pickEvent, beginClosing, closePopover } = useEventPopover(columns[0].key);

    return (
        <div className="day">
            <TimeGrid
                columns={columns}
                onSelectDay={onSelectDay}
                onPickEvent={pickEvent}
                openEventKey={popoverSelection?.key}
            />
            <EventPopover selected={popoverSelection} onClose={closePopover} onClosing={beginClosing} />
        </div>
    );
}

export default DayView;
