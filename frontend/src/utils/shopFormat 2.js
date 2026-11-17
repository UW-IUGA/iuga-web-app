/*
 * Purpose: Pure display formatters shared by the shop storefront and the global cart.
 * Authentication/Authorization Requirements: None (pure functions, no browser or network access).
 * Expected Request Information: Integer cents or ISO date strings.
 * Expected Response Information: Formatted USD strings, US short dates, or Seattle date-times ("" when unparseable).
 */

/**
 * @behavior Formats integer cents into a USD dollar string.
 * @param {number} cents
 * @returns {string}
 */
export function formatCents(cents) {
    return `$${((cents || 0) / 100).toFixed(2)}`;
}

/**
 * @behavior Formats an ISO date string for display (e.g. Oct 5, 2026).
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
    if (!isoString) return "";
    try {
        const date = new Date(isoString);
        return new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
        }).format(date);
    } catch {
        return "";
    }
}

/**
 * @behavior Formats an ISO timestamp as a short date and time in Seattle time (e.g. Oct 5, 9:30 AM),
 *           so every officer sees the same time for an order.
 * @param {string} isoString
 * @returns {string}
 */
export function formatDateTime(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/Los_Angeles",
    }).format(date);
}
