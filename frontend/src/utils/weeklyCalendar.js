import { addDays, format, isSameDay, startOfWeek } from "date-fns";

export const getWeekStart = (date) => startOfWeek(new Date(date), { weekStartsOn: 0 });

export const getWeekDays = (date) => {
    const weekStart = getWeekStart(date);
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
};

export const eventsForDay = (events, day) =>
    events
        .filter((event) => isSameDay(new Date(event.eStartDate), day))
        .sort((first, second) => new Date(first.eStartDate) - new Date(second.eStartDate));

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
