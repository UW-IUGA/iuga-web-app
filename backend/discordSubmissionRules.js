import { neutralizeMentions } from "./discordInteractions.js";

export const CATEGORIES = ["Academic", "Social", "Career"];

const LIMITS = { name: 120, location: 120, description: 1000 };
const TIME = String.raw`(\d{1,2})(?::(\d{2}))?\s*([ap]m)`;
const WHEN_PATTERN = new RegExp(String.raw`^(\d{1,2})/(\d{1,2})/(\d{4})\s+${TIME}\s*[-–]\s*${TIME}$`, "i");
export const WHEN_EXAMPLE = "12/1/2026 6:00 PM - 8:00 PM";
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

function isRealCalendarDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function twentyFourHour(hourText, minuteText, meridiem) {
  const hour = Number(hourText);
  const minute = Number(minuteText ?? 0);
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = meridiem.toLowerCase() === "pm";
  const hour24 = (hour % 12) + (pm ? 12 : 0);
  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/*
 * @behavior Read "M/D/YYYY h:mm AM - h:mm PM" into an ISO date and 24-hour start and end times.
 * @returns { date, startTime, endTime }, or null when the text doesn't match or names an impossible date or time
 */
function parseWhen(when) {
  const match = WHEN_PATTERN.exec(when);
  if (!match) return null;
  const [, monthText, dayText, yearText, startHour, startMinute, startMeridiem, endHour, endMinute, endMeridiem] = match;
  const [year, month, day] = [yearText, monthText, dayText].map(Number);
  if (!isRealCalendarDate(year, month, day)) return null;
  const startTime = twentyFourHour(startHour, startMinute, startMeridiem);
  const endTime = twentyFourHour(endHour, endMinute, endMeridiem);
  if (!startTime || !endTime) return null;
  const date = `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { date, startTime, endTime };
}

/*
 * @behavior Validate and normalize a /event submission. Times are stored in UTC.
 * @param input — { name, when, location, category, description } as typed in the event form
 * @param now — the current Date, passed in so the future-date rule is deterministic
 * @returns { ok: true, value } with the normalized event fields, or { ok: false, errors }
 */
export function validateSubmission(input, now = new Date()) {
  const errors = [];
  const text = (key) => String(input[key] ?? "").trim();

  const name = text("name");
  const location = text("location");
  const description = text("description");
  const when = text("when");
  const category = text("category");

  if (!name) errors.push("Event name is required.");
  if (name.length > LIMITS.name) errors.push(`Event name must be ${LIMITS.name} characters or fewer.`);
  if (!location) errors.push("Location is required.");
  if (location.length > LIMITS.location) errors.push(`Location must be ${LIMITS.location} characters or fewer.`);
  if (!description) errors.push("Description is required.");
  if (description.length > LIMITS.description) errors.push(`Description must be ${LIMITS.description} characters or fewer.`);
  if (!CATEGORIES.includes(category)) errors.push("Category must be Academic, Social, or Career.");

  let eStartDate;
  let eEndDate;
  const parsed = parseWhen(when);
  if (!parsed) {
    errors.push(`When must look like ${WHEN_EXAMPLE} (Pacific time).`);
  } else {
    eStartDate = pacificToUtc(parsed.date, parsed.startTime);
    eEndDate = pacificToUtc(parsed.date, parsed.endTime);
    if (eStartDate <= now) errors.push("The event must start in the future.");
    if (eEndDate <= eStartDate) errors.push("End time must be after the start time.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      eName: neutralizeMentions(name),
      eLocation: neutralizeMentions(location),
      eDescription: neutralizeMentions(description),
      eLabel: category,
      eStartDate,
      eEndDate,
    },
  };
}
