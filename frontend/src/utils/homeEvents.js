/*
Purpose: Decide which events the homepage shows and how it words them.

Callers pass `now` so the choice is the same on every render and in tests.
*/

import { isValid } from "date-fns";
import { toISODate, formatMonthDay } from "./calendar/calendar";

export const HOME_EVENT_COUNT = 3;

export const startOf = (event) => new Date(event.eStartDate);

// Upcoming events, soonest first. When nothing is upcoming, the most recent past
// events, newest first, so the section stays useful between event seasons.
// Events without a readable start date are left out of both.
export function pickHomeEvents(events, now) {
    const dated = events.filter((event) => isValid(startOf(event)));
    const upcoming = dated
        .filter((event) => startOf(event) >= now)
        .sort((a, b) => startOf(a) - startOf(b));

    if (upcoming.length > 0) {
        return { kind: "upcoming", items: upcoming.slice(0, HOME_EVENT_COUNT), total: upcoming.length };
    }

    const latest = dated
        .filter((event) => startOf(event) < now)
        .sort((a, b) => startOf(b) - startOf(a));
    return { kind: "latest", items: latest.slice(0, HOME_EVENT_COUNT), total: latest.length };
}

// "Today", "Tomorrow", "In 3 days", "2 days ago"; a week or more away, the date itself.
export function dayLabel(start, now) {
    // Compare date keys as UTC midnights so a Pacific DST change still counts as one day.
    const days = (Date.parse(toISODate(start)) - Date.parse(toISODate(now))) / 86_400_000;
    if (days === 0) return "Today";
    if (days === 1) return "Tomorrow";
    if (days === -1) return "Yesterday";
    if (days > 1 && days < 7) return `In ${days} days`;
    if (days < -1 && days > -7) return `${-days} days ago`;
    return formatMonthDay(start);
}

// Names how much more the calendar holds, so the link reads as a next step.
export function seeAllLabel({ kind, total }) {
    if (kind === "latest") return "Browse past events";
    if (total > HOME_EVENT_COUNT) return `See all ${total} upcoming events`;
    return "See all events";
}

export const calendarWeekHref = (start) => `/events?view=week&date=${toISODate(start)}`;
