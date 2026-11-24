import { useContext } from "react";
import { buildMonthGrid, groupByMonth, zonedParts } from "../../utils/calendar/calendar";
import { FilterRevealContext } from "../../hooks/useFilterReveal";
import YearCard from "./YearCard";
import { entranceIndexStyle } from "../../utils/calendar/motion";

// Shows every month with events across all years, rather than one selected
// year. Event days open within their month cards; "View day" navigates away.
// `events` are normalized, and already through the tag filter.
function YearView({ events, onPickDay }) {
    const { isMonth } = useContext(FilterRevealContext);
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
                    revealing={isMonth(month.year, month.month)}
                    style={entranceIndexStyle(index)}
                />
            ))}
        </div>
    );
}

export default YearView;
