import { useMemo } from "react";
import useEventPopover from "../../hooks/useEventPopover";
import useMediaQuery from "../../hooks/useMediaQuery";
import { MOBILE_QUERY } from "../../utils/calendar/breakpoints";
import { buildDayColumns, buildWeekDates } from "../../utils/calendar/calendar";
import EventPopover from "./EventPopover";
import TimeGrid from "./TimeGrid";

// A week is the time grid fed seven dates. Clicking an event opens its detail in
// a popover beside it, which can also take the viewer on to that day.
function WeekView({ anchor, events, onSelectDay }) {
    const columns = useMemo(() => buildDayColumns(buildWeekDates(anchor), events), [anchor, events]);
    const { popoverSelection, pickEvent, beginClosing, closePopover } = useEventPopover(columns[0].key);

    // On a phone a tap on a day's empty space goes to that day, as a month's
    // day does; a tap on an event still opens its popover (see TimeGrid).
    const tapDays = useMediaQuery(MOBILE_QUERY);

    return (
        <>
            <TimeGrid
                columns={columns}
                onSelectDay={onSelectDay}
                onPickEvent={pickEvent}
                openEventKey={popoverSelection?.key}
                onPickColumn={tapDays ? onSelectDay : undefined}
            />
            <EventPopover
                selected={popoverSelection}
                onClose={closePopover}
                onClosing={beginClosing}
                onViewDay={onSelectDay}
            />
        </>
    );
}

export default WeekView;
