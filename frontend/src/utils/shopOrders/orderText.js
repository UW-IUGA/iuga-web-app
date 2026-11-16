/*
 * Purpose: The sentences the officer Orders page shows about an order: activity lines, empty-list messages,
 *          the notes before a status change or mark paid, and the small formatters they use.
 * Expected Request Information: An order or one of its activity entries, as the review API returns them.
 * Expected Response Information: Plain strings; no browser or network access.
 */

import { formatCents } from "../shopFormat";
import { FILTER_LABELS, itemSummary, STATUS_LABELS, stockEffect } from "./orderRules";

// "Oct 12": short dates for tags, where the time adds nothing.
export function formatDate(value) {
    return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

// Whole cents from a typed dollar amount such as "50" or "50.25"; null when it isn't one.
export function parseDollars(text) {
    const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim());
    if (!match) return null;
    return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

// Shows a saved phone number in a familiar US format when it is one; otherwise as saved.
export function formatPhone(phone) {
    const digits = phone.replace(/^\+/, "");
    const us = /^1?(\d{3})(\d{3})(\d{4})$/.exec(digits);
    if (us && (digits.length === 10 || phone.startsWith("+1") || digits.length === 11)) {
        return `${digits.length === 11 ? "+1 " : ""}(${us[1]}) ${us[2]}-${us[3]}`;
    }
    return phone.startsWith("+") ? phone : `+${digits}`;
}

// What a change to a picked-up order says, by the status it moved to. Every such change leaves Paid.
const AFTER_PICKUP_CHANGES = { pending: "moved this order to Unconfirmed", not_paid: "dropped this order", refunded: "refunded this order" };

export function historyText(entry) {
    if (entry.kind === "payment" && entry.afterPickup) {
        return `${entry.actor} ${AFTER_PICKUP_CHANGES[entry.to]} after pickup`;
    }
    if (entry.kind === "payment") {
        return `${entry.actor} changed payment from ${STATUS_LABELS[entry.from]} to ${STATUS_LABELS[entry.to]}`;
    }
    if (entry.kind === "note") return `${entry.actor} · ${entry.title}`;
    if (entry.kind === "pickup") return `${entry.actor} ${entry.to === "picked_up" ? "marked picked up" : "cleared picked up"}`;
    if (entry.kind === "amount_received") {
        if (entry.to === "none") {
            return `${entry.actor} changed the amount received from ${formatCents(Number(entry.from))} to Not recorded`;
        }
        return entry.from === "none"
            ? `${entry.actor} recorded ${formatCents(Number(entry.to))} received`
            : `${entry.actor} changed the amount received from ${formatCents(Number(entry.from))} to ${formatCents(Number(entry.to))}`;
    }
    const followUpText = {
        contacted: "contacted the student",
        will_pay: "noted the student will pay",
        says_paid: "noted the student says they already paid",
        none: "cleared the follow-up",
    };
    return `${entry.actor} ${followUpText[entry.to]}`;
}

export function emptyMessage({ filter, q }) {
    if (q) return filter === "all" ? `No orders match “${q}”.` : `No orders match “${q}” in ${FILTER_LABELS[filter]}.`;
    if (filter === "pending") return "No unconfirmed orders. New orders appear here after students confirm checkout.";
    if (filter === "short") return "No orders have a balance remaining.";
    if (filter === "awaiting") return "No orders have an open follow-up.";
    if (filter === "ready") return "No paid orders are waiting for pickup.";
    if (filter === "picked_up") return "No orders have been picked up yet.";
    if (filter === "all") return "No orders.";
    return `No ${FILTER_LABELS[filter].toLowerCase()} orders.`;
}

export function markPaidNote(order) {
    const stock = order.status === "not_paid"
        ? " This retakes the items, so it works only if every item still fits current stock and the student's limit."
        : "";
    return `Only do this after finding the payment from @${order.venmoUsername} in IUGA's Venmo. If this was a mistake, you can change its status from the order.${stock}`;
}

// What moving an order to another status does, in the order an officer should read it.
export function statusChangeNotes(order, to) {
    const from = order.status;
    const notes = [];
    const effect = stockEffect(from, to);
    if (effect === "returns items") notes.push(`Returns to stock: ${itemSummary(order)}. The student's purchase allowance is restored.`);
    if (effect === "takes items again") {
        notes.push(`Takes from stock again: ${itemSummary(order)}. If they are sold out or the student is at their limit, nothing changes.`);
    }
    if (effect === "no stock change") notes.push("Stock doesn't change.");
    if (to === "paid" && (order.amountReceivedCents ?? 0) < order.totalCents) {
        notes.push(`Received becomes ${formatCents(order.totalCents)}.`);
    }
    if ((to === "pending" || to === "not_paid") && "amountBeforePaidCents" in order) {
        const restored = order.amountBeforePaidCents;
        notes.push(restored == null
            ? "Received goes back to Not recorded."
            : `Received goes back to ${formatCents(restored)} of ${formatCents(order.totalCents)}.`);
    }
    if (from === "refunded") notes.push("Only do this if no refund was sent in Venmo.");
    if (to === "paid") notes.push(`Only do this after finding the payment from @${order.venmoUsername} in IUGA's Venmo.`);
    if (to === "refunded") notes.push("Send the refund in Venmo first; this site does not move money.");
    return notes;
}
