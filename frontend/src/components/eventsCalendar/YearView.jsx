import { buildMonthGrid, groupByMonth, zonedParts } from "../../utils/calendar/calendar";
import YearCard from "./YearCard";

// The original events layout: one card per month in the data set, every month
// the calendar has ever held, stacked in a responsive grid. This is what the
// page showed before month/week/day existed.
//
// It is deliberately not anchored to a year. The other three views are one
// anchor at three resolutions, but this one is the whole archive — so it does
// not step, and the toolbar has nothing to step it with.
//
// A day opens in place inside its card (see YearCard) rather than navigating,
// so `onPickDay` is only reached through the overlay's "View day".
//
// The month holding today is outlined, so the archive shows where now is. The
// archive only has cards for months with events, so a month without any has
// nothing to outline.
function YearView({ rawEvents, onPickDay }) {
    const months = groupByMonth(rawEvents);
    const now = zonedParts(new Date());

    return (
        <div className="year">
            {months.map((month) => (
                <YearCard
                    key={`${month.year}-${month.month}`}
                    title={`${month.name} ${month.year}`}
                    rows={buildMonthGrid(month.year, month.month, month.events)}
                    onPickDay={onPickDay}
                    isCurrent={month.year === now.year && month.month === now.month}
                />
            ))}
        </div>
    );
}

export default YearView;
