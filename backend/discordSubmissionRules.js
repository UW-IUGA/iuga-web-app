export const CATEGORIES = ["Academic", "Social", "Career"];

const LIMITS = { name: 120, location: 120, description: 1000, rsvpUrl: 300 };
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
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

function isRealCalendarDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

/*
 * @behavior Stop mention tokens from pinging anyone when text is posted back into Discord.
 */
export function neutralizeMentions(text) {
  return text.replace(/<[@#][!&]?\d+>/g, "").replace(/@/g, "@​");
}

/*
 * @behavior Validate and normalize a /event submission. Times are stored in UTC.
 * @param input — raw fields from the command, as strings
 * @param now — the current Date, passed in so the future-date rule is deterministic
 * @returns { ok: true, value } with the normalized event fields, or { ok: false, errors }
 */
export function validateSubmission(input, now = new Date()) {
  const errors = [];
  const text = (key) => String(input[key] ?? "").trim();

  const name = text("name");
  const location = text("location");
  const description = text("description");
  const date = text("date");
  const startTime = text("startTime");
  const endTime = text("endTime");
  const category = text("category");
  const rsvpRaw = text("rsvpUrl");

  if (!name) errors.push("Event name is required.");
  if (name.length > LIMITS.name) errors.push(`Event name must be ${LIMITS.name} characters or fewer.`);
  if (!location) errors.push("Location is required.");
  if (location.length > LIMITS.location) errors.push(`Location must be ${LIMITS.location} characters or fewer.`);
  if (!description) errors.push("Description is required.");
  if (description.length > LIMITS.description) errors.push(`Description must be ${LIMITS.description} characters or fewer.`);
  if (!CATEGORIES.includes(category)) errors.push("Category must be Academic, Social, or Career.");

  const dateValid = DATE_PATTERN.test(date) && isRealCalendarDate(date);
  const startValid = TIME_PATTERN.test(startTime);
  if (!dateValid) errors.push("Date must be a real date in YYYY-MM-DD format.");
  if (!startValid) errors.push("Start time must be HH:MM in 24-hour time.");

  let eStartDate;
  let eEndDate;
  if (dateValid && startValid) {
    eStartDate = pacificToUtc(date, startTime);
    if (eStartDate <= now) errors.push("The event must start in the future.");
  }
  if (endTime && !TIME_PATTERN.test(endTime)) {
    errors.push("End time must be HH:MM in 24-hour time.");
  } else if (endTime && dateValid) {
    eEndDate = pacificToUtc(date, endTime);
    if (eStartDate && eEndDate <= eStartDate) errors.push("End time must be after the start time.");
  }

  let rsvpUrl;
  if (rsvpRaw) {
    if (rsvpRaw.length > LIMITS.rsvpUrl) {
      errors.push(`RSVP link must be ${LIMITS.rsvpUrl} characters or fewer.`);
    } else {
      try {
        const parsed = new URL(rsvpRaw);
        if (parsed.protocol !== "https:") errors.push("RSVP link must start with https://.");
        else rsvpUrl = parsed.href;
      } catch {
        errors.push("RSVP link must be a valid URL.");
      }
    }
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
      rsvpUrl,
    },
  };
}
