/*
 * Purpose: The email drafts an officer can send a student about an order: the templates that fit the
 *          order's state, best default first, each with a recipient, subject, and body.
 * Expected Request Information: An order as the review API returns it, and the handler that logs a follow-up.
 * Expected Response Information: A list of { id, label, draft, followUp? } templates.
 */

import { formatCents, formatDateTime } from "../shopFormat";
import { orderReference } from "./orderRules";

// What every email to a student shares: the greeting, the order line, the items, and the sign-off. A template
// supplies its subject and the payment lines that come between the items and the sign-off.
function draftEmail(order, subject, paymentLines) {
    const firstName = order.buyer?.name?.split(" ")[0] || "there";
    const items = order.lines.map((line) => `- ${line.quantity} × ${line.name}, size ${line.size}`).join("\n");
    return {
        recipient: order.buyer?.email ?? "",
        subject,
        body: [
            `Hi ${firstName},`,
            "",
            `This is IUGA about your merchandise order ${orderReference(order)}, confirmed ${formatDateTime(order.confirmedAt)}.`,
            "",
            "Items:",
            items,
            "",
            ...paymentLines,
            "",
            "Thanks,",
            "[Your name]",
            "IUGA",
        ].join("\n"),
    };
}

// Asks for the rest when some was received, and for the payment when nothing has matched yet.
function reminderPaymentLines(order) {
    const received = order.amountReceivedCents;
    if (received != null && received > 0 && received < order.totalCents) {
        return [
            `We received ${formatCents(received)} of the ${formatCents(order.totalCents)} for this order, so ${formatCents(order.totalCents - received)} is still owed.`,
            "",
            `Could you send the remaining ${formatCents(order.totalCents - received)} on Venmo, or reply if you think this is a mistake?`,
        ];
    }
    return [
        `Expected Venmo payment: ${formatCents(order.totalCents)} from @${order.venmoUsername}`,
        "",
        "We haven't matched this payment in IUGA's Venmo yet. Could you reply with when you sent it, or send it if you haven't yet?",
    ];
}

// The email templates for one order, best default first. Paid too much leads a Paid order when more was received
// than the total. Refunded orders return the whole amount, so they never get it; Paid and Refunded orders owe
// nothing, so they only get a General message with no payment request.
// Unconfirmed and Dropped orders get Can't find their payment when the student said they paid, then Payment reminder.
export function emailTemplates(order, onFollowUp) {
    const reference = orderReference(order);
    const total = formatCents(order.totalCents);
    const received = order.amountReceivedCents;
    const templates = [];
    if (received != null && received > order.totalCents && order.status !== "refunded") {
        const difference = formatCents(received - order.totalCents);
        templates.push({
            id: "overpaid",
            label: "Paid too much",
            draft: draftEmail(order, `Your IUGA order ${reference}: extra payment`, [
                `We received ${formatCents(received)} for this order, which is ${difference} more than the ${total} total. We're returning the extra ${difference} to @${order.venmoUsername} on Venmo.`,
                "",
                "Reply if you have any questions.",
            ]),
        });
    }
    if (order.status === "paid" || order.status === "refunded") {
        templates.push({
            id: "general",
            label: "General message",
            draft: draftEmail(order, `Your IUGA order ${reference}`, ["[Write your message here]"]),
        });
        return templates;
    }
    if (order.followUp.status === "says_paid") {
        templates.push({
            id: "says_paid",
            label: "Can't find their payment",
            draft: draftEmail(order, `Your IUGA order ${reference}: finding your Venmo payment`, [
                `You let us know you already paid, but we haven't found a payment of ${total} from @${order.venmoUsername} in IUGA's Venmo yet.`,
                "",
                "Could you reply with the date and time you sent it and the Venmo username you sent it from? A screenshot of the payment also helps.",
            ]),
        });
    }
    templates.push({
        id: "reminder",
        label: "Payment reminder",
        draft: draftEmail(order, `Your IUGA order ${reference}`, reminderPaymentLines(order)),
        followUp: { confirmLabel: "Yes, mark as contacted", onConfirm: () => onFollowUp("contacted") },
    });
    return templates;
}
