/*
Purpose: Pure rules for manual Venmo shop holds: deadlines, line totals, line removal, per-student
         limits, and Venmo username validation. No database or clock access; callers pass the current
         time in milliseconds.
Authentication/Authorization Requirements: N/A (pure utility module, not a route)
Expected Request Information: N/A
Expected Response Information: N/A

A "line" is one product in one size with a quantity, for example 2 Hoodies in size M.
*/

export const HOLD_DURATION_MS = 15 * 60 * 1000;
export const DROP_UNIT_CAP = 24;
export const DEFAULT_PER_STUDENT_LIMIT = 1;

const VENMO_USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,30}$/;

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
 * @behavior The per-student limit for a product. A missing limit document means the default of 1.
 * @param limitDoc — { perStudentLimit } or null
 * @returns integer limit
 */
export function perStudentLimitFor(limitDoc) {
  return limitDoc?.perStudentLimit ?? DEFAULT_PER_STUDENT_LIMIT;
}

/*
 * @behavior Normalize a student's Venmo username. A single leading "@" is allowed and removed.
 *           Allowed characters: letters, digits, dots, hyphens, and underscores; 1 to 30 characters.
 * @param value — raw username from the request body
 * @returns the normalized username, or null when it is not valid
 */
export function normalizeVenmoUsername(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/^@/, "");
  return VENMO_USERNAME_PATTERN.test(trimmed) ? trimmed : null;
}
