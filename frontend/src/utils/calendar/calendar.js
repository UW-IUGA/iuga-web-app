import { categoriesFor } from "../eventStreams";

const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];

const WEEKDAY_ABBREVIATIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Every date on this site is read and displayed in one zone. The mock data
// arrives as UTC instants, but a student in Seattle looking at a calendar
// cares which Pacific day an event falls on — not which UTC day.
//
// Placement and display MUST agree, otherwise an event lands on one grid cell
// and its label says a different date. `zonedParts` feeds placement;
// `Intl` formatters in the format* helpers feed display. Both read TIMEZONE.
const TIMEZONE = "America/Los_Angeles";

const ZONED_PARTS_FORMATTERS = new Map();

// Decompose an instant into the y/m/d/h/m it reads as inside `timeZone`.
// Returns 0-indexed month and 0-23 hour to match the Date accessors it replaces.
function zonedParts(date, timeZone = TIMEZONE) {
    let formatter = ZONED_PARTS_FORMATTERS.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat("en-US", {
            timeZone,
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            second: "numeric",
            hourCycle: "h23",
        });
        ZONED_PARTS_FORMATTERS.set(timeZone, formatter);
    }

    const fields = {};
    for (const { type, value } of formatter.formatToParts(date)) {
        fields[type] = value;
    }

    return {
        year: Number(fields.year),
        month: Number(fields.month) - 1,
        day: Number(fields.day),
        hour: Number(fields.hour),
        minute: Number(fields.minute),
        second: Number(fields.second),
    };
}

// The event categories, in the order the legend lists them, and their colours.
// Dark text clears 6:1 on every one of them (see contrast.test.js). The app
// shows the stored Career label as Professional (see utils/eventStreams.js), so
// the calendar offers the three categories a visitor can actually see.
export const EVENT_LABELS = ["Academic", "Social", "Professional"];

const LABEL_COLORS = {
    Academic: "#5fa5f9",
    Social: "#e879f9",
    Professional: "#a78bfa",
};

// For an event with no label, or one the legend does not know.
const UNLABELLED_COLOR = LABEL_COLORS.Academic;

// An event takes its first listed label's colour, so every colour on screen is
// one the legend names. Events with several labels used to get a colour
// hashed from the whole combination, which had no meaning: a Social and
// Academic event could come out an unrelated colour. The full set of labels is still
// listed in the event's detail.
function colorForLabels(labels) {
    return LABEL_COLORS[labels?.[0]] ?? UNLABELLED_COLOR;
}

export function normalizeEvent(raw) {
    const start = new Date(raw.eStartDate);
    // Read the wall-clock position out of the Pacific zone rather than the
    // instant's own UTC, so grid placement matches what the label will say.
    const zoned = zonedParts(start);

    return {
        id: raw.eId ?? raw._id?.$oid ?? null,
        name: raw.eName ?? "",
        description: raw.eDescription ?? "",
        location: raw.eLocation ?? "",
        organizers: raw.eOrganizers ?? "",
        // Displayed names, once each: Career and Professional both read as Professional.
        labels: Array.isArray(raw.eLabels) ? [...new Set(categoriesFor(raw))] : [],
        thumbnail: raw.eThumbnailPath ?? null,
        altLink: raw.eAltLink?.title && raw.eAltLink?.url ? raw.eAltLink : null,
        participants: typeof raw.participants === "number" ? raw.participants : null,
        showParticipants: raw.showParticipants ?? false,
        rsvpEnabled: raw.rsvpEnabled ?? false,
        rsvpQuestions: Array.isArray(raw.rsvpQuestions) ? raw.rsvpQuestions : [],
        year: zoned.year,
        month: zoned.month,
        day: zoned.day,
        hour: zoned.hour,
        minute: zoned.minute,
        start,
        end: raw.eEndDate ? new Date(raw.eEndDate) : null,
    };
}

// Display-side formatters. These read the same zone that `zonedParts` does,
// so a cell and its label can't drift apart.
const DATE_TIME_FMT = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
});

const ZONE_FMT = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "short",
});

const CLOCK_TIME_FMT = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
});

const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
});

const MONTH_YEAR_FMT = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "long",
    year: "numeric",
});

const MONTH_DAY_FMT = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
});

export function formatEventDateTime(event) {
    const parts = Object.fromEntries(DATE_TIME_FMT.formatToParts(event.start).map(({ type, value }) => [type, value]));
    const zone = ZONE_FMT.formatToParts(event.start).find((p) => p.type === "timeZoneName").value;
    return `${parts.weekday}, ${parts.month} ${parts.day}, ${parts.year} · ${parts.hour}:${parts.minute} ${parts.dayPeriod} ${zone}`;
}

// Short forms for the time grid: gutter labels, column headers, day headers.
export const formatClockTime = (date) => CLOCK_TIME_FMT.format(date);
export const formatWeekday = (date) => WEEKDAY_FMT.format(date);
export const formatMonthYear = (date) => MONTH_YEAR_FMT.format(date);
export const formatMonthDay = (date) => MONTH_DAY_FMT.format(date);

const SHORT_MONTH_DAY_FMT = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    month: "short",
    day: "numeric",
});

const LONG_DAY_FMT = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
});

const FULL_DATE_FMT = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
});

// "Thursday, October 22" and "Thursday, October 22, 2026". The long forms are
// for accessible names: a day cell shows only its number, and a screen reader
// user cannot see the weekday header or the month title above it.
export const formatLongDay = (date) => LONG_DAY_FMT.format(date);
export const formatFullDate = (date) => FULL_DATE_FMT.format(date);

// "no events", "1 event", "3 events".
export function countEvents(count) {
    if (count === 0) return "no events";
    return `${count} event${count === 1 ? "" : "s"}`;
}

/**
 * "All Events", "October 2026", "Oct 18 – Oct 24, 2026", "Thu, Oct 22, 2026" —
 * whatever the current view is actually showing, so the toolbar label never
 * claims a wider span than the grid beneath it.
 *
 * Year view is the whole archive rather than a single year, so it takes no
 * anchor and does not pretend to name one.
 */
export function formatRange(mode, anchor) {
    if (mode === "year") {
        return "All Events";
    }

    if (mode === "week") {
        const [start] = buildWeekDates(anchor);
        const end = addDays(start, 6);
        const endYear = zonedParts(end).year;
        return `${SHORT_MONTH_DAY_FMT.format(start)} – ${SHORT_MONTH_DAY_FMT.format(end)}, ${endYear}`;
    }

    if (mode === "day") {
        const { year } = zonedParts(anchor);
        return `${MONTH_DAY_FMT.format(anchor)}, ${year}`;
    }

    return MONTH_YEAR_FMT.format(anchor);
}

export function buildMonthGrid(year, month, events) {
    const firstWeekDay = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    // Every cell gets its real date, so consumers navigate without re-deriving
    // the month's leading offset themselves.
    const gridStart = startOfWeek(zonedMidnight(year, month, 1));

    const cells = Array.from({ length: 42 }, (_, index) => ({
        id: index,
        day: index - firstWeekDay + 1,
        inMonth: index - firstWeekDay + 1 >= 1 && index - firstWeekDay + 1 <= dayCount,
        date: addDays(gridStart, index),
        events: [],
    }));

    for (const event of events) {
        // Bucketing alone is not enough: an event on the 21st of another month
        // would otherwise land in this grid's 21st cell.
        if (event.year !== year || event.month !== month) continue;
        const cell = cells[firstWeekDay + event.day - 1];
        if (cell) cell.events.push(event);
    }

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
}

export function groupByMonth(rawEvents) {
    const events = rawEvents.map(normalizeEvent);
    const buckets = new Map();

    for (const event of events) {
        const key = `${event.year}-${event.month}`;
        if (!buckets.has(key)) {
            buckets.set(key, { year: event.year, month: event.month, events: [] });
        }
        buckets.get(key).events.push(event);
    }

    // Months are 0-indexed and unpadded, so `${year}-${month}` sorts
    // lexicographically wrong ("2024-9" > "2024-11"). Fold to a single
    // ordinal instead.
    const monthOrdinal = ({ year, month }) => year * 12 + month;

    return [...buckets.values()]
        .sort((a, b) => monthOrdinal(b) - monthOrdinal(a))
        .map((bucket) => ({ ...bucket, name: MONTH_NAMES[bucket.month] }));
}

// ---------------------------------------------------------------------------
// Time grid math
//
// Everything below works on Pacific wall-clock values rather than raw
// instants, so an event's position inside a column matches the label the
// viewer reads. Day boundaries are rebuilt from the wall clock on every hop,
// which is what keeps a DST transition from shifting a whole column by an
// hour.
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

// Used when a source event has no usable end. The grid positions by
// duration, so a zero-length event would render as a hairline.
export const FALLBACK_DURATION_MINUTES = 60;

const WEEK_STARTS_ON = 0; // Sunday, matching WEEKDAY_ABBREVIATIONS

// Rebuild the instant corresponding to local midnight of a calendar day.
// Starts from the naive UTC midnight and corrects by the offset actually
// observed, iterating because the correction can itself cross a DST
// boundary.
export function zonedMidnight(year, month, day, timeZone = TIMEZONE) {
    const targetWall = Date.UTC(year, month, day);
    let guess = new Date(targetWall);

    for (let pass = 0; pass < 3; pass++) {
        const observed = zonedParts(guess, timeZone);
        const observedWall = Date.UTC(
            observed.year,
            observed.month,
            observed.day,
            observed.hour,
            observed.minute,
            observed.second,
        );
        const drift = targetWall - observedWall;
        if (drift === 0) break;
        guess = new Date(guess.getTime() + drift);
    }

    return guess;
}

export function addDays(date, amount, timeZone = TIMEZONE) {
    const { year, month, day } = zonedParts(date, timeZone);
    return zonedMidnight(year, month, day + amount, timeZone);
}

export function daysInMonth(year, month) {
    // Day 0 of the following month is the last day of this one.
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function addMonths(date, amount, timeZone = TIMEZONE) {
    const { year, month, day } = zonedParts(date, timeZone);
    const target = new Date(Date.UTC(year, month + amount, 1));
    // Clamp so moving Jan 31 forward a month lands on Feb 28, not March 3.
    const clamped = Math.min(day, daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
    return zonedMidnight(target.getUTCFullYear(), target.getUTCMonth(), clamped, timeZone);
}

// 0 = Sunday … 6 = Saturday, for the Pacific calendar day rather than the
// instant's UTC day — the two disagree for evening events.
function weekdayIndexOf(year, month, day) {
    // 1970-01-01 was a Thursday (4, Sunday = 0).
    return (((Math.floor(Date.UTC(year, month, day) / DAY_MS) + 4) % 7) + 7) % 7;
}

export function startOfWeek(anchor, timeZone = TIMEZONE) {
    const { year, month, day } = zonedParts(anchor, timeZone);
    return addDays(
        zonedMidnight(year, month, day, timeZone),
        -(weekdayIndexOf(year, month, day) - WEEK_STARTS_ON),
        timeZone,
    );
}

export function addWeeks(anchor, amount, timeZone = TIMEZONE) {
    return addDays(startOfWeek(anchor, timeZone), amount * 7, timeZone);
}

export function buildWeekDates(anchor, timeZone = TIMEZONE) {
    const start = startOfWeek(anchor, timeZone);
    return Array.from({ length: 7 }, (_, index) => addDays(start, index, timeZone));
}

export function isSameDay(a, b, timeZone = TIMEZONE) {
    const x = zonedParts(a, timeZone);
    const y = zonedParts(b, timeZone);
    return x.year === y.year && x.month === y.month && x.day === y.day;
}

export function dayKeyOf(date, timeZone = TIMEZONE) {
    const { year, month, day } = zonedParts(date, timeZone);
    return `${year}-${month}-${day}`;
}

// Split an event into per-day segments. An event spanning midnight
// contributes one segment per day it touches, each clipped to that day.
export function eventSegments(event, timeZone = TIMEZONE) {
    const start = zonedParts(event.start, timeZone);
    const startMinutes = start.hour * MINUTES_PER_HOUR + start.minute;

    let end;
    let endMinutes;
    if (event.end && event.end > event.start) {
        end = zonedParts(event.end, timeZone);
        endMinutes = end.hour * MINUTES_PER_HOUR + end.minute;
    } else {
        end = start;
        endMinutes = Math.min(startMinutes + FALLBACK_DURATION_MINUTES, MINUTES_PER_DAY);
    }

    const startKey = Date.UTC(start.year, start.month, start.day);
    const endKey = Date.UTC(end.year, end.month, end.day);

    const segments = [];
    for (let cursor = startKey; cursor <= endKey; cursor += DAY_MS) {
        const at = new Date(cursor);
        const year = at.getUTCFullYear();
        const month = at.getUTCMonth();
        const day = at.getUTCDate();
        const isFirst = cursor === startKey;
        const isLast = cursor === endKey;

        segments.push({
            key: `${year}-${month}-${day}`,
            year,
            month,
            day,
            date: new Date(cursor),
            startMinutes: isFirst ? startMinutes : 0,
            endMinutes: isLast ? endMinutes : MINUTES_PER_DAY,
        });
    }

    return segments;
}

// Side-by-side packing for events that overlap in time.
//
// Events are grouped into clusters of transitively-overlapping neighbours,
// then each is dropped into the first column whose previous event has already
// ended. Every event in a cluster reports the cluster's total column count so
// the view can divide the width evenly.
export function layoutOverlaps(events) {
    const sorted = [...events].sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes);

    const packed = [];
    let cluster = [];
    let clusterEnd = -Infinity;

    const flush = () => {
        if (!cluster.length) return;

        const columnEnds = [];
        for (const item of cluster) {
            let column = columnEnds.findIndex((end) => end <= item.startMinutes);
            if (column === -1) {
                column = columnEnds.length;
                columnEnds.push(0);
            }
            columnEnds[column] = item.endMinutes;
            item.columnIndex = column;
        }

        for (const item of cluster) item.columnCount = columnEnds.length;
        packed.push(...cluster);
    };

    for (const item of sorted) {
        if (cluster.length && item.startMinutes >= clusterEnd) {
            flush();
            cluster = [];
            clusterEnd = -Infinity;
        }
        cluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.endMinutes);
    }
    flush();

    return packed;
}

// How far past its own share of the column an overlapped event reaches, as a
// multiple of that share. Google Calendar's cascade: an event runs on under
// the one to its right, so both stay readable without halving either.
const OVERLAP_REACH = 1.7;

// Horizontal placement inside a day column, as percentages of its width, for
// an event packed by layoutOverlaps. Events in a cluster step right by an
// equal share; each but the rightmost reaches on past its share, under the
// next one. The rightmost keeps its share exactly, so nothing ever extends
// past the column's right edge. `layer` stacks later columns on top, which is
// what makes the overlap read as a cascade rather than a collision.
export function overlapBox(columnIndex, columnCount) {
    const share = 100 / columnCount;
    const left = columnIndex * share;
    const isLast = columnIndex === columnCount - 1;
    const width = isLast ? share : Math.min(share * OVERLAP_REACH, 100 - left);

    return { left, width, layer: columnIndex };
}

// Build one column per day in `dates`, each carrying that day's events
// positioned as percentages of the 24-hour column. Shared by the week and day
// views — they differ only in how many dates they pass in.
export function buildDayColumns(dates, events, timeZone = TIMEZONE) {
    const now = new Date();

    return dates.map((date) => {
        const key = dayKeyOf(date, timeZone);

        const timed = [];
        for (const event of events) {
            for (const segment of eventSegments(event, timeZone)) {
                if (segment.key !== key) continue;
                timed.push({
                    ...segment,
                    event,
                    top: (segment.startMinutes / MINUTES_PER_DAY) * 100,
                    height: ((segment.endMinutes - segment.startMinutes) / MINUTES_PER_DAY) * 100,
                });
            }
        }

        return {
            key,
            date,
            parts: zonedParts(date, timeZone),
            isToday: isSameDay(date, now, timeZone),
            events: layoutOverlaps(timed),
        };
    });
}

export { buildMonthGrid as default, colorForLabels, MONTH_NAMES, TIMEZONE, WEEKDAY_ABBREVIATIONS, zonedParts };
