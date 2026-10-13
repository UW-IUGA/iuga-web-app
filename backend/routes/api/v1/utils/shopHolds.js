/*
Purpose: Pure rules for manual Venmo shop holds: deadlines, line totals, line removal, per-student
         limits, and Venmo username validation. No database or clock access; callers pass the current
         time in milliseconds.
Authentication/Authorization Requirements: N/A (pure utility module, not a route)
Expected Request Information: N/A
Expected Response Information: N/A

A "line" is one product in one size with a quantity, for example 2 Hoodies in size M.
*/

const DEFAULT_HOLD_MINUTES = 15;

/*
 * @behavior Converts SHOP_HOLD_MINUTES into a hold duration. Unset means the default of 15 minutes.
 *           Testing environments can shorten it. A value that is not a positive number fails startup.
 * @param rawMinutes — the environment value, or undefined
 * @returns duration in milliseconds
 */
export function holdDurationMs(rawMinutes) {
  if (rawMinutes === undefined || rawMinutes === "") {
    return DEFAULT_HOLD_MINUTES * 60 * 1000;
  }
  const minutes = Number(rawMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new Error(`SHOP_HOLD_MINUTES must be a positive number of minutes, got "${rawMinutes}".`);
  }
  return minutes * 60 * 1000;
}

export const HOLD_DURATION_MS = holdDurationMs(process.env.SHOP_HOLD_MINUTES);
export const DROP_UNIT_CAP = 24;
export const DEFAULT_PER_STUDENT_LIMIT = 5;

const VENMO_USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,30}$/;
const PHONE_NUMBER_PATTERN = /^\+?\d{7,15}$/;

/*
 * @behavior Compute the deadline for a hold created at nowMs.
 * @param nowMs — current timestamp in milliseconds
 * @returns deadline timestamp in milliseconds
 */
export function holdExpiresAtMs(nowMs) {
  return nowMs + HOLD_DURATION_MS;
}

/*
 * @behavior A hold is past its deadline at and after expiresAt, so a confirmation at the deadline is rejected.
 * @param expiresAtMs — hold deadline in milliseconds
 * @param nowMs — current timestamp in milliseconds
 * @returns true when the deadline has passed
 */
export function isHoldDeadlinePassed(expiresAtMs, nowMs) {
  return nowMs >= expiresAtMs;
}

/*
 * @behavior Sum a hold's lines in cents, applying each line's quantity.
 * @param lines — array of { unitPriceCents, quantity }
 * @returns integer cents
 */
export function holdTotalCents(lines) {
  return lines.reduce((sum, line) => sum + line.unitPriceCents * line.quantity, 0);
}

/*
 * @behavior Remove the line matching sku and size. The deadline is owned by the caller and does not change.
 * @param lines — array of { sku, size, quantity, ... }
 * @param sku — product sku
 * @param size — size label
 * @returns { lines: remaining lines, removed: the removed line or null when none matched }
 */
export function removeHoldLine(lines, sku, size) {
  const removed = lines.find((line) => line.sku === sku && line.size === size) ?? null;
  if (!removed) {
    return { lines, removed: null };
  }
  return {
    lines: lines.filter((line) => !(line.sku === sku && line.size === size)),
    removed,
  };
}


/*
 * @behavior Normalize a student's Venmo username. A single leading "@" is allowed and removed,
 *           and letters are lowercased so one account always compares equal.
 *           Allowed characters: letters, digits, dots, hyphens, and underscores; 1 to 30 characters.
 * @param value — raw username from the request body
 * @returns the normalized username, or null when it is not valid
 */
export function normalizeVenmoUsername(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/^@/, "");
  return VENMO_USERNAME_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

/*
 * @behavior Normalize a student's phone number, US or international. Spaces, dashes, periods, and
 *           parentheses are removed. The result must be 7 to 15 digits, with an optional leading "+"
 *           for a country code.
 * @param value — raw phone number from the request body
 * @returns the digits with any leading "+", or null when it is not valid
 */
export function normalizePhoneNumber(value) {
  if (typeof value !== "string") {
    return null;
  }
  const digits = value.replace(/[\s().-]/g, "");
  return PHONE_NUMBER_PATTERN.test(digits) ? digits : null;
}
