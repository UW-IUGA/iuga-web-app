import * as chrono from "chrono-node";
import { neutralizeMentions } from "./discordInteractions.js";

export const CATEGORIES = ["Academic", "Social", "Career"];

const LIMITS = { name: 120, location: 120, description: 1000 };
export const WHEN_EXAMPLE = "Dec 1, 6-8pm";
const UNREADABLE_WHEN = `Couldn't read When. Try "${WHEN_EXAMPLE}" or "Fri 6:30-8pm".`;
const NO_AM_PM = "Add am or pm, like 6-8pm.";
const NO_END = `Add an end time, like ${WHEN_EXAMPLE}.`;
const PACIFIC = "America/Los_Angeles";

/*
 * @behavior Convert a wall-clock date and time in Pacific time to a UTC Date, including daylight saving.
 * @param date — "YYYY-MM-DD"
 * @param time — "HH:MM" (24-hour)
 */
export function pacificToUtc(date, time) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hours, minutes);
  let utc = wallClockAsUtc;
  // Two passes settle the offset even when the first guess lands on the other side of a DST switch.
  for (let pass = 0; pass < 2; pass += 1) {
    utc = wallClockAsUtc - pacificOffsetMs(new Date(utc));
  }
  return new Date(utc);
}

function pacificOffsetMs(instant) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const part = (type) => Number(parts.find((p) => p.type === type).value);
  const localAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );
  return localAsUtc - (instant.getTime() - instant.getUTCMilliseconds());
}

const pad = (number) => String(number).padStart(2, "0");
const pacificDate = new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC, year: "numeric", month: "2-digit", day: "2-digit" });

/*
 * @behavior Read a typed date and time range such as "Dec 1 6-8pm", "Fri 6:30-8pm", or "12/1 18:00-20:00",
 *           against today's date in Pacific time. Only fully stated input counts: the whole text must be
 *           read, a date or day name must be given, and both times must be given. A date without a year
 *           means its next occurrence, counting today.
 * @returns { date: "YYYY-MM-DD", startTime: "HH:MM", endTime: "HH:MM", endDate }, { problem } naming what's
 *          missing, or null when unreadable
 */
// Smooth over typing habits chrono doesn't read: trailing punctuation, long dashes, "noon", and M-D dates.
function tidyWhen(when) {
  return when
    .replace(/[.!,;]+$/, "")
    .replace(/[—―]/g, "-")
    .replace(/\bnoon\b/gi, "12pm")
    .replace(/\bmidnight\b/gi, "12am")
    .replace(/^(\d{1,2})-(\d{1,2})(?=\s)/, "$1/$2")
    // "Mar 10 11-1pm": without "at", chrono reads "10 11" as a year.
    .replace(/^([a-z]{3,}\.?\s+\d{1,2}(?:st|nd|rd|th)?),?\s+(?=\d)/i, "$1 at ")
    .trim();
}

// "18:00-20:00" needs no am/pm, but "6:00-8:00" does: only an hour past 12 shows a 24-hour clock.
function isTwentyFourHour(when) {
  const range = /(\d{1,2}):\d{2}\s*(?:-|to)\s*(\d{1,2}):\d{2}\s*$/i.exec(when);
  return Boolean(range) && (Number(range[1]) > 12 || Number(range[2]) > 12);
}

const NO_MERIDIEM = /\d\s*(?:-|to)\s*\d{1,2}(?::\d{2})?\s*$/i;

function parseWhen(typed, now) {
  const when = tidyWhen(typed);
  if (NO_MERIDIEM.test(when) && !/[ap]\.?m?\b/i.test(when) && !isTwentyFourHour(when)) return { problem: NO_AM_PM };
  // Measure "next occurrence" from midnight today, so a time earlier today stays today and is refused
  // as past, instead of being moved a year ahead.
  const midnight = pacificToUtc(pacificDate.format(now), "00:00");
  const reference = { instant: midnight, timezone: pacificOffsetMs(midnight) / 60_000 };
  const [result, ...extra] = chrono.parse(when, reference, { forwardDate: true });
  if (!result || extra.length > 0 || result.index !== 0 || result.text !== when) return null;
  const { start, end } = result;
  const dateStated = start.isCertain("day") || start.isCertain("weekday");
  if (!dateStated || !start.isCertain("hour")) return null;
  if (!end?.isCertain("hour")) return { problem: NO_END };
  // "11-1pm": a start with no am/pm that would land after the end is the morning.
  // chrono wraps "11-1pm" past midnight, so the end lands on the next day at an earlier hour. A real
  // multi-day range ("Dec 1-2 6-8pm") ends at a later hour, and the same-day rule refuses it below.
  if (!start.isCertain("meridiem") && start.get("hour") >= 12 && end.get("hour") < start.get("hour")) {
    start.assign("hour", start.get("hour") - 12);
    for (const part of ["year", "month", "day"]) end.assign(part, start.get(part));
  }
  const dateOf = (moment) => `${moment.get("year")}-${pad(moment.get("month"))}-${pad(moment.get("day"))}`;
  const timeOf = (moment) => `${pad(moment.get("hour"))}:${pad(moment.get("minute"))}`;
  return { date: dateOf(start), startTime: timeOf(start), endDate: dateOf(end), endTime: timeOf(end) };
}

/*
 * @behavior Validate and normalize a /event submission. Times are stored in UTC.
 * @param input — { name, when, location, categories, description } from the event form; categories is a list
 * @param now — the current Date, passed in so the future-date rule is deterministic
 * @returns { ok: true, value } with the normalized event fields, or { ok: false, errors } where errors maps
 *          each field with a problem (name, when, location, categories, description) to its message
 */
export function validateSubmission(input, now = new Date()) {
  const errors = {};
  const text = (key) => String(input[key] ?? "").trim();

  const name = text("name");
  const location = text("location");
  const description = text("description");
  const when = text("when");
  const categories = Array.isArray(input.categories) ? input.categories.map((value) => String(value).trim()) : [];

  if (!name) errors.name = "Event name is required.";
  else if (name.length > LIMITS.name) errors.name = `Event name must be ${LIMITS.name} characters or fewer.`;
  if (!location) errors.location = "Location is required.";
  else if (location.length > LIMITS.location) errors.location = `Location must be ${LIMITS.location} characters or fewer.`;
  if (!description) errors.description = "Description is required.";
  else if (description.length > LIMITS.description) {
    errors.description = `Description must be ${LIMITS.description} characters or fewer.`;
  }
  if (categories.length === 0 || !categories.every((value) => CATEGORIES.includes(value))) {
    errors.categories = "Pick at least one category: Academic, Social, or Career.";
  }

  let eStartDate;
  let eEndDate;
  const parsed = parseWhen(when, now);
  if (!parsed) {
    errors.when = UNREADABLE_WHEN;
  } else if (parsed.problem) {
    errors.when = parsed.problem;
  } else {
    eStartDate = pacificToUtc(parsed.date, parsed.startTime);
    eEndDate = pacificToUtc(parsed.endDate, parsed.endTime);
    if (parsed.endDate !== parsed.date || eEndDate <= eStartDate) {
      errors.when = "End time must be after the start time, on the same day.";
    } else if (eStartDate <= now) {
      errors.when = "The event must start in the future.";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      eName: neutralizeMentions(name),
      eLocation: neutralizeMentions(location),
      eDescription: neutralizeMentions(description),
      eLabels: CATEGORIES.filter((value) => categories.includes(value)),
      eStartDate,
      eEndDate,
    },
  };
}
