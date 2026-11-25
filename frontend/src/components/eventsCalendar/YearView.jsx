import { useContext } from "react";
import { buildMonthGrid, groupByMonth, zonedParts } from "../../utils/calendar/calendar";
import { EntranceWaveContext } from "../../hooks/useEntranceWave";
import YearCard from "./YearCard";
import { entranceOrder } from "../../utils/calendar/motion";

// Shows every month with events across all years, rather than one selected
// year. Event days open within their month cards; "View day" navigates away.
// `events` are normalized, and already through the tag filter.
function YearView({ events, onPickDay }) {
    const { isMonth } = useContext(EntranceWaveContext);
    const months = groupByMonth(events);
    const today = zonedParts(new Date());

    return (
        <div className="year">
            {months.map((month, index) => (
                <YearCard
                    key={`${month.year}-${month.month}`}
                    title={`${month.name} ${month.year}`}
                    rows={buildMonthGrid(month.year, month.month, month.events)}
                    onPickDay={onPickDay}
                    isCurrentMonth={month.year === today.year && month.month === today.month}
                    entering={isMonth(month.year, month.month)}
                    style={entranceOrder(index)}
                />
            ))}
        </div>
    );
}

export default YearView;
