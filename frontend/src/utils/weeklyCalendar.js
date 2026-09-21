import { addDays, format, isSameDay, startOfWeek } from "date-fns";

export const getWeekStart = (date) => startOfWeek(new Date(date), { weekStartsOn: 0 });

export const getWeekDays = (date) => {
    const weekStart = getWeekStart(date);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
};

/*
 * @behavior Filter events that occur on a specific calendar day and sort them in chronological order.
 * @param events — array of event objects, each having an eStartDate
 * @param day — a Date object representing the day to match against
 * @returns a new array of matching event objects sorted from earliest to latest start time, or empty array if none
 */
export const eventsForDay = (events, day) =>
    events
        .filter((event) => isSameDay(new Date(event.eStartDate), day))
        .sort((first, second) => new Date(first.eStartDate) - new Date(second.eStartDate));

/*
 * @behavior Format a readable date range label for the 7-day week containing a given date.
 * @param date — a Date object, timestamp, or date string within the target week
 * @returns a formatted range string, such as "Jan 5–11, 2025" or "Dec 28, 2024–Jan 3, 2025" if spanning years
 */
export const formatWeekLabel = (date) => {
    const weekDays = getWeekDays(date);
    const weekStart = weekDays[0];
    const weekEnd = weekDays[6];
    const startYear = format(weekStart, "yyyy");
    const endYear = format(weekEnd, "yyyy");

    if (startYear !== endYear) {
        return `${format(weekStart, "MMM d, yyyy")}–${format(weekEnd, "MMM d, yyyy")}`;
    }

    return `${format(weekStart, "MMM d")}–${format(weekEnd, "d, yyyy")}`;
};
