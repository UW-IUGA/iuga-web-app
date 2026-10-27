import { buildMonthGrid, groupByMonth, zonedParts } from "../../utils/calendar/calendar";
import YearCard from "./YearCard";

// Shows every month with events across all years, rather than one selected
// year. Event days open within their month cards; "View day" navigates away.
function YearView({ rawEvents, onPickDay }) {
    const months = groupByMonth(rawEvents);
    const today = zonedParts(new Date());

    return (
        <div className="year">
            {months.map((month) => (
                <YearCard
                    key={`${month.year}-${month.month}`}
                    title={`${month.name} ${month.year}`}
                    rows={buildMonthGrid(month.year, month.month, month.events)}
                    onPickDay={onPickDay}
                    isCurrentMonth={month.year === today.year && month.month === today.month}
                />
            ))}
        </div>
    );
}

export default YearView;
