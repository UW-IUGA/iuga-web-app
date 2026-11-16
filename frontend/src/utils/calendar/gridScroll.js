// Where the week and day time grid opens: with its first event at the top of
// the hours. Kept apart from TimeGrid so the arithmetic can be tested without
// laying anything out.

const MINUTES_PER_HOUR = 60;

// Room above the first event, so the hour label it starts on (drawn half a
// line above the hour) is not cut off under the day headers.
const LEAD = 8;

/**
 * The event that starts earliest in the day across `columns`, or null when
 * they hold none. In the week that is by time of day, whichever day it is on,
 * so every other event is at or below it.
 */
export function firstEvent(columns) {
    let first = null;
    for (const column of columns) {
        for (const item of column.events) {
            if (!first || item.startMinutes < first.startMinutes) first = item;
        }
    }
    return first;
}

/**
 * The scroll offset that puts the start of `item` at the top of the hours,
 * just under the stuck day headers. The headers take their own room above the
 * hours, so the offset is the event's distance down the day, less the lead.
 */
export function scrollTopFor(item, hourHeight) {
    return Math.max(0, (item.startMinutes / MINUTES_PER_HOUR) * hourHeight - LEAD);
}
