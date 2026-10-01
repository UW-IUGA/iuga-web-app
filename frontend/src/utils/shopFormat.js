/*
 * Purpose: Pure display formatters shared by the shop storefront and the global cart.
 * Authentication/Authorization Requirements: None (pure functions, no browser or network access).
 * Expected Request Information: Integer cents or ISO date strings.
 * Expected Response Information: Formatted USD strings or US short dates ("" when unparseable).
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
