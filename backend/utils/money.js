/*
 * Purpose: State once what a trustworthy amount of money looks like. The provider client reads
 * Stripe's amounts, the reducer judges them, and the event request routes accept them from a
 * request body; all three have to mean the same thing by "a whole number of cents", or a payment
 * can be judged on a number that was never real.
 */

/*
 * @behavior Check that a value is a whole number of cents that can be compared and stored exactly.
 *           `Number.isInteger` is not enough: it accepts values past the safe integer range, which
 *           cannot be represented exactly and so cannot be money.
 * @param value — the amount in cents
 * @returns true when the value is a safe integer of zero or more
 */
export function isWholeCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
