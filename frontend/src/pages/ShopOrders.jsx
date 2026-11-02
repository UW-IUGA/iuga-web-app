/*
Purpose: Officer Orders page, a payments dashboard for the Director of Finance and other board members who
         check IUGA's Venmo. An overview shows what pending orders still owe; an amount-first table lists
         orders to match against Venmo; a drawer shows one order's balance, items, contact, and activity.
         Every change is confirmed in a small dialog first.
Authentication/Authorization Requirements: Logged in. The server checks the shop.purchases.review permission
  on every request; without it the page shows no order details.
Expected Request Information: Calls GET /api/v1/shop/purchases (status, followUp, balance, pickup, q, cursor),
  GET /api/v1/shop/purchases/counts, GET /api/v1/shop/purchases/:id, and PATCH
  /api/v1/shop/purchases/:id/payment, /amount-received, and /follow-up.
Expected Response Information: An admin bar instead of the site navbar, the overview, filters, the order
  table, the drawer, confirmations, announcements, and clear notices for sign-in, access, empty, conflict,
  and failure states. Orders stay in memory only.
*/

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faEllipsis, faEnvelope, faMagnifyingGlass, faPhone, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useAuthContext } from "../context/AuthContext";
import EmailContactDialog from "../components/EmailContactDialog";
import AdminBar from "../components/AdminBar";
import { usePopover } from "../hooks/usePopover";
import { useModalDialog } from "../hooks/useModalDialog";
import { formatCents, formatDateTime } from "../utils/shopFormat";

const API = "/api/v1/shop/purchases";
// Each filter is one server query. Balance remaining and Follow-up look across every payment status.
// Paid orders are split by pickup, so Ready for pickup holds only orders still to hand over and Picked up
// keeps finished ones out of the way without hiding them from search or All.
// Labels describe each state as the Director of Finance sees it in Venmo; server values stay as stored. Pending reads
// as Unconfirmed: the student may have paid, but no officer has found the payment yet.
const FILTERS = [
    { value: "pending", label: "Unconfirmed", query: { status: "pending" } },
    { value: "short", label: "Balance remaining", query: { status: "all", balance: "short" } },
    { value: "awaiting", label: "Follow-up", query: { status: "all", followUp: "awaiting" } },
    { value: "ready", label: "Ready for pickup", query: { status: "paid", pickup: "ready" } },
    { value: "picked_up", label: "Picked up", query: { status: "paid", pickup: "picked_up" } },
    { value: "not_paid", label: "Dropped", query: { status: "not_paid" } },
    { value: "refunded", label: "Refunded", query: { status: "refunded" } },
    { value: "all", label: "All", query: { status: "all" } },
];
const FILTER_LABELS = Object.fromEntries(FILTERS.map((filter) => [filter.value, filter.label]));
const STATUS_LABELS = { pending: "Unconfirmed", paid: "Paid", not_paid: "Dropped", refunded: "Refunded" };
// Where follow-up with the student stands. It never changes payment status.
const FOLLOW_UP_LABELS = { contacted: "Contacted", will_pay: "Will pay", says_paid: "Says paid" };
const FOLLOW_UP_CHOICES = [
    { value: "contacted", label: "I contacted the student" },
    { value: "will_pay", label: "Student said they will pay" },
    { value: "says_paid", label: "Student says they already paid" },
];
const MAX_NOTE_LENGTH = 500;
const MAX_TOPIC_LENGTH = 80;
const RESULT_TEXT = { pending: "Moved back to unconfirmed", paid: "Marked paid", not_paid: "Dropped", refunded: "Refund recorded" };
const LOST_RESPONSE_MESSAGE = "We couldn't confirm that change. Review the latest details before trying again.";
const GENERIC_FAILURE = "Couldn't save. Nothing changed. Try again.";
const AMOUNT_HINT = "Enter an amount like 50 or 50.00.";
const INITIAL_FILTERS = { filter: "pending", q: "" };
const TABLE_COLUMNS = 7;
const SEARCH_DELAY_MS = 300;
const NO_RESULT = { text: "", tone: "", undo: null, retryIds: [] };

function listUrl({ filter, q }, cursor) {
    const { status, followUp = "all", balance, pickup } = FILTERS.find((item) => item.value === filter).query;
    const params = new URLSearchParams({ status, followUp });
    if (balance) params.set("balance", balance);
    if (pickup) params.set("pickup", pickup);
    if (q) params.set("q", q);
    if (cursor) params.set("cursor", cursor);
    return `${API}?${params}`;
}

function toItems(purchases) {
    return purchases.map((order) => ({ id: order.id, order }));
}

async function readJson(response) {
    return response.json().catch(() => null);
}

function orderReference(order) {
    return `...${order.id.slice(-4)}`;
}

function buyerLabel(order) {
    return order.buyer?.name || order.buyer?.email || "Account unavailable";
}

function canMarkPaid(order) {
    return order.status === "pending" || order.status === "not_paid";
}

// A picked-up order that is no longer Paid: the merch was handed over, and the change took it back.
function changedAfterPickup(order) {
    return order.status !== "paid" && Boolean(order.pickup.pickedUpAt);
}

// Matches the server's short filter: an amount was recorded and it is below the total.
function isShort(order) {
    const received = order.amountReceivedCents;
    return canMarkPaid(order) && received != null && received < order.totalCents;
}

function matchesFilter(order, filter) {
    if (filter === "all") return true;
    if (filter === "short") return isShort(order);
    if (filter === "awaiting") return Boolean(order.followUp.status);
    if (filter === "ready") return order.status === "paid" && !order.pickup.pickedUpAt;
    if (filter === "picked_up") return order.status === "paid" && Boolean(order.pickup.pickedUpAt);
    return order.status === filter;
}

// What was bought, by product and price. Sizes are left out: they don't change what is owed.
function purchasedProducts(order) {
    const products = new Map();
    for (const line of order.lines) {
        const key = `${line.sku}-${line.unitPriceCents}`;
        const product = products.get(key) ?? { key, name: line.name, quantity: 0, unitPriceCents: line.unitPriceCents, totalCents: 0 };
        product.quantity += line.quantity;
        product.totalCents += line.lineTotalCents;
        products.set(key, product);
    }
    return [...products.values()];
}

function itemSummary(order) {
    return purchasedProducts(order).map((product) => (product.quantity > 1 ? `${product.name} ×${product.quantity}` : product.name)).join(", ");
}

// "Oct 12": short dates for tags, where the time adds nothing.
function formatDate(value) {
    return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function plural(count, one, many) {
    return `${count} ${count === 1 ? one : many}`;
}

// Whole cents from a typed dollar amount such as "50" or "50.25"; null when it isn't one.
function parseDollars(text) {
    const match = /^(\d{1,6})(?:\.(\d{1,2}))?$/.exec(text.trim());
    if (!match) return null;
    return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

// Shows a saved phone number in a familiar US format when it is one; otherwise as saved.
function formatPhone(phone) {
    const digits = phone.replace(/^\+/, "");
    const us = /^1?(\d{3})(\d{3})(\d{4})$/.exec(digits);
    if (us && (digits.length === 10 || phone.startsWith("+1") || digits.length === 11)) {
        return `${digits.length === 11 ? "+1 " : ""}(${us[1]}) ${us[2]}-${us[3]}`;
    }
    return phone.startsWith("+") ? phone : `+${digits}`;
}

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
function emailTemplates(order, onFollowUp) {
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

// What a change to a picked-up order says, by the status it moved to. Every such change leaves Paid.
const AFTER_PICKUP_CHANGES = { pending: "moved this order to Unconfirmed", not_paid: "dropped this order", refunded: "refunded this order" };

function historyText(entry) {
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

function emptyMessage({ filter, q }) {
    if (q) return filter === "all" ? `No orders match “${q}”.` : `No orders match “${q}” in ${FILTER_LABELS[filter]}.`;
    if (filter === "pending") return "No unconfirmed orders. New orders appear here after students confirm checkout.";
    if (filter === "short") return "No orders have a balance remaining.";
    if (filter === "awaiting") return "No orders have an open follow-up.";
    if (filter === "ready") return "No paid orders are waiting for pickup.";
    if (filter === "picked_up") return "No orders have been picked up yet.";
    if (filter === "all") return "No orders.";
    return `No ${FILTER_LABELS[filter].toLowerCase()} orders.`;
}

function markPaidNote(order) {
    const stock = order.status === "not_paid"
        ? " This retakes the items, so it works only if every item still fits current stock and the student's limit."
        : "";
    return `Only do this after finding the payment from @${order.venmoUsername} in IUGA's Venmo. If this was a mistake, you can change its status from the order.${stock}`;
}

// The three figures an officer acts on: money on orders not yet confirmed, money received on confirmed (Paid) orders,
// and open follow-ups. Unconfirmed and Follow-up open their tabs. Color marks only money: amber while any is still
// unconfirmed, green for what was confirmed. Refunded orders leave Confirmed, since they are no longer Paid.
function Overview({ counts, totals, onChooseFilter }) {
    const receivedSoFar = totals.receivedCents > 0 ? ` · ${formatCents(totals.receivedCents)} received` : "";
    const cards = [
        {
            label: "Unconfirmed",
            value: formatCents(totals.owedCents),
            note: `${plural(totals.pendingOrders, "order", "orders")}${receivedSoFar}`,
            tone: totals.owedCents > 0 ? "owed" : "",
            filter: "pending",
        },
        {
            label: "Confirmed",
            value: formatCents(totals.confirmedCents),
            note: plural(counts.paid, "order", "orders"),
            tone: "received",
        },
        {
            label: "Follow-up",
            value: plural(counts.awaiting, "order", "orders"),
            note: counts.says_paid > 0 ? `${counts.says_paid} ${counts.says_paid === 1 ? "says" : "say"} they already paid` : "open on any order",
            tone: "",
            filter: "awaiting",
        },
    ];
    return (
        <div className="shopAdmin__overview" role="group" aria-label="Overview">
            {cards.map(({ label, value, note, tone, filter }) => {
                const className = tone ? `shopAdmin__stat shopAdmin__stat--${tone}` : "shopAdmin__stat";
                const body = (
                    <>
                        <span className="shopAdmin__statLabel">{label}</span>
                        <span className="shopAdmin__statValue">{value}</span>
                        <span className="shopAdmin__statNote">{note}</span>
                    </>
                );
                return filter ? (
                    <button key={label} type="button" className={className} onClick={() => onChooseFilter(filter)}>{body}</button>
                ) : (
                    <div key={label} className={className}>{body}</div>
                );
            })}
        </div>
    );
}

// Payment status as a small labeled badge: the text names the state, the color only helps scanning.
function StatusBadge({ order }) {
    return <span className={`shopAdmin__badge shopAdmin__badge--${order.status}`}>{STATUS_LABELS[order.status]}</span>;
}

// Unconfirmed and Paid orders hold their items; Dropped and Refunded orders have returned them to stock.
const HOLDS_STOCK = new Set(["pending", "paid"]);

// What a status change does to stock, shown in the status menu and its confirmation.
function stockEffect(from, to) {
    if (HOLDS_STOCK.has(from) === HOLDS_STOCK.has(to)) return "no stock change";
    return HOLDS_STOCK.has(to) ? "takes items again" : "returns items";
}

/*
 * @behavior The order's status badge in the drawer, as a button that opens Change status, so the status
 *           itself is where an officer goes to correct it.
 */
function StatusButton({ order, disabled, onClick }) {
    return (
        <button
            type="button"
            className={`shopAdmin__badge shopAdmin__badge--${order.status} shopAdmin__statusButton`}
            aria-label={`Change status, now ${STATUS_LABELS[order.status]}`}
            aria-haspopup="dialog"
            title="Change status"
            disabled={disabled}
            onClick={(event) => onClick(event.currentTarget)}
        >
            {STATUS_LABELS[order.status]}
            <FontAwesomeIcon className="shopAdmin__chevron" icon={faChevronDown} aria-hidden="true" />
        </button>
    );
}

// How much of an unconfirmed or dropped order has been recorded as received. Nothing recorded is not the
// same as nothing paid, so it says so.
function PaymentProgress({ order }) {
    if (!canMarkPaid(order)) return null;
    const received = order.amountReceivedCents;
    if (received == null) return <span className="shopAdmin__progressText shopAdmin__muted">Not recorded</span>;
    return (
        <>
            <span className="shopAdmin__progressText">{formatCents(received)} of {formatCents(order.totalCents)} received</span>
            <span className="shopAdmin__progress">
                <span className="shopAdmin__progressBar" aria-hidden="true">
                    <span style={{ width: `${Math.min(received / order.totalCents, 1) * 100}%` }} />
                </span>
                {received < order.totalCents && <span className="shopAdmin__due">{formatCents(order.totalCents - received)} left</span>}
            </span>
        </>
    );
}

// An open follow-up as a quiet tag; it is not a payment state, so it has no badge color. "Says paid" is
// the exception: it waits on an officer to check Venmo, so it is marked as waiting.
function FollowUpTag({ order }) {
    const { status, updatedAt } = order.followUp;
    if (!status) return null;
    return (
        <span className={status === "says_paid" ? "shopAdmin__followUpTag shopAdmin__followUpTag--waiting" : "shopAdmin__followUpTag"}>
            <span>{FOLLOW_UP_LABELS[status]}</span>
            {updatedAt && <span className="shopAdmin__muted">{formatDate(updatedAt)}</span>}
        </span>
    );
}

// A paid order that has been handed over at pickup. Shown beside the status so the table reads at a glance.
function PickupTag({ order }) {
    if (order.status !== "paid" || !order.pickup.pickedUpAt) return null;
    return <span className="shopAdmin__pickupTag">Picked up</span>;
}

// Flags an order whose status changed after it was picked up, in warning colors, so it stands out when scanning.
function AfterPickupTag({ order }) {
    if (!changedAfterPickup(order)) return null;
    return (
        <span className="shopAdmin__afterPickupTag">
            {order.status === "refunded" ? "Refunded after pickup" : "Changed after pickup"}
        </span>
    );
}

// The warning shown before any change that moves a picked-up order away from Paid.
function PickupWarning({ order }) {
    return (
        <p className="shopAdmin__pickupWarning">
            This order was picked up on {formatDateTime(order.pickup.pickedUpAt)} by {order.pickup.pickedUpBy ?? "an officer"}.
            Only continue if the student returned the merch.
        </p>
    );
}

/*
 * @behavior The reason and the buttons for a change to a picked-up order. Confirm waits until the reason has
 *           text, and the reason is sent trimmed.
 */
function ReasonConfirm({ close, danger = false, confirmLabel, onConfirm }) {
    const [reason, setReason] = useState("");
    const reasonId = useId();
    const trimmed = reason.trim();

    return (
        <>
            <label htmlFor={reasonId}>Reason (required)</label>
            <input
                id={reasonId}
                type="text"
                data-autofocus
                maxLength={MAX_NOTE_LENGTH}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
            />
            <div className="shopAdmin__modalButtons">
                <button type="button" className="shopAdmin__button" onClick={close}>Cancel</button>
                <button
                    type="button"
                    className={danger ? "shopAdmin__button shopAdmin__button--danger" : "shopAdmin__button shopAdmin__button--primary"}
                    disabled={!trimmed}
                    onClick={() => {
                        close();
                        onConfirm(trimmed);
                    }}
                >
                    {confirmLabel}
                </button>
            </div>
        </>
    );
}

/*
 * @behavior A small confirmation dialog. The element marked data-autofocus takes focus when it opens;
 *           every way of closing it calls onClose.
 */
function Modal({ open, title, onClose, children }) {
    const { dialogProps, close } = useModalDialog(open, onClose);
    const titleId = useId();

    useEffect(() => {
        if (open) dialogProps.ref.current?.querySelector("[data-autofocus]")?.focus();
    }, [open, dialogProps.ref]);

    return (
        <dialog className="shopAdmin__modal" aria-labelledby={titleId} {...dialogProps}>
            {open && (
                <>
                    <h2 id={titleId} className="shopAdmin__modalTitle">{title}</h2>
                    {children(close)}
                </>
            )}
        </dialog>
    );
}

function ModalButtons({ close, confirmLabel, danger = false, onConfirm }) {
    return (
        <div className="shopAdmin__modalButtons">
            <button type="button" className="shopAdmin__button" data-autofocus onClick={close}>Cancel</button>
            <button
                type="button"
                className={danger ? "shopAdmin__button shopAdmin__button--danger" : "shopAdmin__button shopAdmin__button--primary"}
                onClick={() => {
                    close();
                    onConfirm();
                }}
            >
                {confirmLabel}
            </button>
        </div>
    );
}

/*
 * @behavior Records the total amount the officer saw arrive in Venmo, previewing what will remain.
 *           An amount that covers the order marks it paid on the server, and the dialog says so first.
 */
function AmountForm({ order, close, onSave }) {
    const current = order.amountReceivedCents;
    const [text, setText] = useState(current == null ? "" : (current / 100).toFixed(2));
    const [error, setError] = useState("");
    const inputId = useId();
    const cents = parseDollars(text);
    const covers = cents !== null && cents >= order.totalCents;

    const submit = (event) => {
        event.preventDefault();
        if (cents === null) {
            setError(AMOUNT_HINT);
            return;
        }
        close();
        onSave(cents);
    };

    return (
        <form className="shopAdmin__amountForm" onSubmit={submit} noValidate>
            <p className="shopAdmin__muted">Enter the total you found from @{order.venmoUsername} in IUGA's Venmo. {formatCents(order.totalCents)} is expected.</p>
            <label htmlFor={inputId}>Amount received ($)</label>
            <input
                id={inputId}
                type="text"
                inputMode="decimal"
                data-autofocus
                value={text}
                aria-invalid={error ? "true" : undefined}
                aria-describedby={error ? `${inputId}-error` : undefined}
                onChange={(event) => {
                    setText(event.target.value);
                    setError("");
                }}
            />
            {error && <p id={`${inputId}-error`} className="shopAdmin__fieldError">{error}</p>}
            <p className="shopAdmin__preview" aria-live="polite">
                {cents !== null && (covers
                    ? `${formatCents(cents)} covers the ${formatCents(order.totalCents)} expected, so saving marks the order paid.${
                        cents > order.totalCents ? ` That's ${formatCents(cents - order.totalCents)} more than expected; refund the difference in Venmo.` : ""}`
                    : `${formatCents(order.totalCents - cents)} will remain.`)}
            </p>
            <div className="shopAdmin__modalButtons">
                <button type="button" className="shopAdmin__button" onClick={close}>Cancel</button>
                <button type="submit" className="shopAdmin__button shopAdmin__button--primary">
                    {covers ? "Save and mark paid" : "Save amount"}
                </button>
            </div>
        </form>
    );
}

// What moving an order to another status does, in the order an officer should read it.
function statusChangeNotes(order, to) {
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

/*
 * @behavior Changes an order's status, mainly to correct one set by mistake. Lists every other status with
 *           its stock effect; once one is chosen it explains what happens to stock and the amount received,
 *           and warns when a Venmo check is needed. An optional reason is saved with the change. Nothing is
 *           sent until a status is chosen and confirmed; Cancel sends nothing.
 */
function StatusChangeForm({ order, close, onConfirm }) {
    const [to, setTo] = useState(null);
    const [reason, setReason] = useState("");
    const reasonId = useId();
    const choices = Object.keys(STATUS_LABELS).filter((status) => status !== order.status);
    const requiresReason = Boolean(to) && to !== "paid" && Boolean(order.pickup.pickedUpAt);

    const submit = (event) => {
        event.preventDefault();
        close();
        onConfirm(to, reason.trim());
    };

    return (
        <form className="shopAdmin__followUpForm" onSubmit={submit}>
            <p>Now: <StatusBadge order={order} /></p>
            <fieldset>
                <legend>Change to</legend>
                {choices.map((status, index) => (
                    <label key={status} className="shopAdmin__choice">
                        <input
                            type="radio"
                            name="paymentStatus"
                            value={status}
                            data-autofocus={index === 0 ? true : undefined}
                            checked={to === status}
                            onChange={() => setTo(status)}
                        />
                        {STATUS_LABELS[status]}
                        <span className="shopAdmin__muted">{stockEffect(order.status, status)}</span>
                    </label>
                ))}
            </fieldset>
            {to && (
                <div className="shopAdmin__statusNotes">
                    {requiresReason && <PickupWarning order={order} />}
                    {statusChangeNotes(order, to).map((note) => <p key={note}>{note}</p>)}
                </div>
            )}
            <label htmlFor={reasonId}>{requiresReason ? "Reason (required)" : "Reason (optional)"}</label>
            <input
                id={reasonId}
                type="text"
                maxLength={MAX_NOTE_LENGTH}
                placeholder="Set by mistake"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
            />
            <div className="shopAdmin__modalButtons">
                <button type="button" className="shopAdmin__button" onClick={close}>Cancel</button>
                <button
                    type="submit"
                    className={to && !HOLDS_STOCK.has(to) ? "shopAdmin__button shopAdmin__button--danger" : "shopAdmin__button shopAdmin__button--primary"}
                    disabled={!to || (requiresReason && !reason.trim())}
                >
                    {to ? `Move to ${STATUS_LABELS[to]}` : "Change status"}
                </button>
            </div>
        </form>
    );
}

/*
 * @behavior Adds to the order's log: where follow-up with the student stands, or, under Other, an entry on
 *           a topic the officer names, which leaves the follow-up as it was. Each can carry a note. Clear
 *           is offered only while a follow-up is open. Save waits for a choice, and for a topic under Other.
 */
function FollowUpForm({ order, close, onSave }) {
    const [choice, setChoice] = useState(null);
    const [topic, setTopic] = useState("");
    const [note, setNote] = useState("");
    const noteId = useId();
    const topicId = useId();
    const other = choice === "other";
    const choices = [
        ...FOLLOW_UP_CHOICES,
        { value: "other", label: "Other" },
        ...(order.followUp.status ? [{ value: "none", label: "Clear follow-up" }] : []),
    ];

    const submit = (event) => {
        event.preventDefault();
        close();
        onSave(choice, note.trim(), topic.trim());
    };

    return (
        <form className="shopAdmin__followUpForm" onSubmit={submit}>
            <fieldset>
                <legend>What happened?</legend>
                {choices.map((option, index) => (
                    <label key={option.value} className="shopAdmin__choice">
                        <input
                            type="radio"
                            name="followUpStatus"
                            value={option.value}
                            data-autofocus={index === 0 ? true : undefined}
                            checked={choice === option.value}
                            onChange={() => setChoice(option.value)}
                        />
                        {option.label}
                    </label>
                ))}
            </fieldset>
            {other && (
                <>
                    <label htmlFor={topicId}>Topic</label>
                    <input
                        id={topicId}
                        type="text"
                        maxLength={MAX_TOPIC_LENGTH}
                        placeholder="For example, Venmo username changed"
                        value={topic}
                        onChange={(event) => setTopic(event.target.value)}
                    />
                </>
            )}
            <label htmlFor={noteId}>{other ? "Description (optional)" : "Note (optional)"}</label>
            <textarea
                id={noteId}
                rows={3}
                maxLength={MAX_NOTE_LENGTH}
                aria-describedby={`${noteId}-hint`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
            />
            <p id={`${noteId}-hint`} className="shopAdmin__muted">Only officers who review orders see notes. Notes can't be edited later.</p>
            <div className="shopAdmin__modalButtons">
                <button type="button" className="shopAdmin__button" onClick={close}>Cancel</button>
                <button type="submit" className="shopAdmin__button shopAdmin__button--primary" disabled={!choice || (other && !topic.trim())}>Save</button>
            </div>
        </form>
    );
}

/*
 * @behavior A Contact button that opens the buyer's email and phone, with call and email templates.
 *           Disabled when the buyer's account no longer exists.
 */
function ContactMenu({ order, contact, saving, onFollowUp }) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const regionId = useId();
    const close = useCallback((refocus) => {
        setOpen(false);
        if (refocus) buttonRef.current?.focus();
    }, []);
    const { wrapperRef, onKeyDown } = usePopover(open, close);

    return (
        <div className="shopAdmin__popoverWrap" ref={wrapperRef}>
            <button
                type="button"
                className="shopAdmin__button"
                ref={buttonRef}
                aria-expanded={open}
                aria-controls={open ? regionId : undefined}
                disabled={!order.buyer}
                onClick={() => setOpen((value) => !value)}
            >
                Contact
                <FontAwesomeIcon className="shopAdmin__chevron" icon={faChevronDown} aria-hidden="true" />
            </button>
            {open && (
                <div id={regionId} role="region" aria-label="Contact details" className="shopAdmin__popover shopAdmin__contact" onKeyDown={onKeyDown}>
                    <div className="shopAdmin__contactLine">
                        <FontAwesomeIcon icon={faEnvelope} aria-hidden="true" />
                        {order.buyer.email ? (
                            <>
                                <span className="shopAdmin__contactValue">{order.buyer.email}</span>
                            </>
                        ) : <span className="shopAdmin__muted">No email on file</span>}
                    </div>
                    <div className="shopAdmin__contactLine">
                        <FontAwesomeIcon icon={faPhone} aria-hidden="true" />
                        {contact.status === "loading" && <span className="shopAdmin__muted">Loading contact details…</span>}
                        {contact.status === "error" && <span className="shopAdmin__muted">Couldn't load the phone number.</span>}
                        {contact.status === "ready" && !contact.phone && <span className="shopAdmin__muted">No phone number on file</span>}
                        {contact.status === "ready" && contact.phone && (
                            <>
                                <span className="shopAdmin__contactValue">{formatPhone(contact.phone)}</span>
                                <a className="shopAdmin__link" href={`tel:${contact.phone}`}>Call</a>
                            </>
                        )}
                    </div>
                    <EmailContactDialog
                        contextLabel={`Order ${orderReference(order)} · ${buyerLabel(order)}`}
                        title="Email about this order"
                        triggerLabel="Write email"
                        triggerClassName="shopAdmin__button"
                        disabled={!order.buyer.email || saving}
                        templates={emailTemplates(order, onFollowUp)}
                    />
                </div>
            )}
        </div>
    );
}

/*
 * @behavior A "···" button opening a menu of an order's less common actions. The first item takes focus;
 *           arrow keys, Home, and End move between items; Escape closes it and returns focus to the button.
 *           Choosing an item passes the button to it, so a dialog it opens can return focus there.
 */
function ActionsMenu({ label, actions, disabled }) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const itemRefs = useRef([]);
    const close = useCallback((refocus) => {
        setOpen(false);
        if (refocus) buttonRef.current?.focus();
    }, []);
    const { wrapperRef, onKeyDown: closeOnEscape } = usePopover(open, close);

    useEffect(() => {
        if (open) itemRefs.current[0]?.focus();
    }, [open]);

    const onKeyDown = (event) => {
        const items = itemRefs.current.filter(Boolean);
        const index = items.indexOf(document.activeElement);
        const moves = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 };
        if (event.key in moves) {
            event.preventDefault();
            items[(moves[event.key] + items.length) % items.length]?.focus();
        } else if (event.key === "Tab") {
            close(false);
        } else {
            closeOnEscape(event);
        }
    };

    return (
        <div className="shopAdmin__popoverWrap shopAdmin__popoverWrap--actions" ref={wrapperRef}>
            <button
                type="button"
                className="shopAdmin__button shopAdmin__button--icon"
                ref={buttonRef}
                aria-label={label}
                aria-haspopup="menu"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((value) => !value)}
            >
                <FontAwesomeIcon icon={faEllipsis} aria-hidden="true" />
            </button>
            {open && (
                <div role="menu" aria-label="Order actions" className="shopAdmin__popover shopAdmin__menu" onKeyDown={onKeyDown}>
                    {actions.map((action, index) => (
                        <button
                            key={action.label}
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            ref={(node) => { itemRefs.current[index] = node; }}
                            className={action.danger ? "shopAdmin__menuItem shopAdmin__menuItem--danger" : "shopAdmin__menuItem"}
                            onClick={() => {
                                close(true);
                                action.onSelect(buttonRef.current);
                            }}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// The three figures an officer compares with Venmo, with progress while money is partly recorded. The
// amount received is entered or corrected right beside it, on orders that can still change.
function PaymentSummary({ order, onEnterAmount }) {
    const received = order.amountReceivedCents;
    const settled = order.status === "paid" || order.status === "refunded";
    const remaining = settled ? 0 : Math.max(order.totalCents - (received ?? 0), 0);
    const partial = !settled && received != null && received < order.totalCents;
    return (
        <>
            <dl className="shopAdmin__balance" role="group" aria-label="Payment">
                <div><dt>Expected</dt><dd>{formatCents(order.totalCents)}</dd></div>
                <div>
                    <dt>Received</dt>
                    <dd className={received == null ? "shopAdmin__muted" : undefined}>
                        {received == null ? "Not recorded" : formatCents(received)}
                        {onEnterAmount && canMarkPaid(order) && (
                            <button
                                type="button"
                                className="shopAdmin__textButton"
                                aria-label={received == null ? "Enter amount received" : "Edit amount received"}
                                onClick={(event) => onEnterAmount(event.currentTarget)}
                            >
                                {received == null ? "Enter" : "Edit"}
                            </button>
                        )}
                    </dd>
                </div>
                <div className="shopAdmin__balanceTotal">
                    <dt>Remaining</dt>
                    <dd className={remaining > 0 ? "shopAdmin__due" : undefined}>{formatCents(remaining)}</dd>
                </div>
            </dl>
            {partial && (
                <span className="shopAdmin__progressBar shopAdmin__progressBar--wide" aria-hidden="true">
                    <span style={{ width: `${(received / order.totalCents) * 100}%` }} />
                </span>
            )}
            {received > order.totalCents && (
                <p className="shopAdmin__callout">Over by {formatCents(received - order.totalCents)}. Refund the difference in Venmo.</p>
            )}
        </>
    );
}

/*
 * @behavior A slide-over drawer for one order, in the order the officer's questions come: how much and in
 *           what state, the main action, how to reach the student, the balance, what they bought, reference
 *           details, then what already happened. Without an item (the order left the current filter) it is
 *           read-only.
 */
function OrderDrawer({ order, item, contact, actions, onMarkPaid, onEnterAmount, onAddToLog, onFollowUp, onChangeStatus, onClose }) {
    const { dialogProps, close } = useModalDialog(Boolean(order), onClose);
    const titleId = useId();
    const saving = Boolean(item?.saving);

    return (
        <dialog className="shopAdmin__drawer" aria-labelledby={titleId} {...dialogProps}>
            {order && (
                <div className="shopAdmin__drawerBody">
                    <header className="shopAdmin__drawerHeader">
                        <h2 id={titleId}>Order {orderReference(order)}</h2>
                        <button type="button" className="shopAdmin__button shopAdmin__button--icon" aria-label="Close order details" onClick={close}>
                            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                        </button>
                    </header>

                    <div className="shopAdmin__drawerSummary">
                        <div className="shopAdmin__drawerAmount">
                            <span>{formatCents(order.totalCents)}</span>
                            {item ? <StatusButton order={order} disabled={saving} onClick={onChangeStatus} /> : <StatusBadge order={order} />}
                        </div>
                        <p className="shopAdmin__muted">from @{order.venmoUsername}</p>
                    </div>
                    {order.followUp.status && (
                        <p className="shopAdmin__followUpLine">
                            {FOLLOW_UP_LABELS[order.followUp.status]} · {formatDateTime(order.followUp.updatedAt)}
                            {order.followUp.updatedBy ? ` by ${order.followUp.updatedBy}` : ""}
                        </p>
                    )}
                    {changedAfterPickup(order) && (
                        <div className="shopAdmin__afterPickupNote">
                            <AfterPickupTag order={order} />
                            <p>Picked up {formatDateTime(order.pickup.pickedUpAt)} by {order.pickup.pickedUpBy ?? "an officer"}.</p>
                        </div>
                    )}
                    {!order.buyer && <p className="shopAdmin__muted">This student's account no longer exists, so there is no contact information.</p>}
                    {item?.notice && <p className="shopAdmin__notice" role="alert">{item.notice}</p>}

                    {item && (
                        <div className="shopAdmin__drawerActions">
                            {canMarkPaid(order) && (
                                <button
                                    type="button"
                                    className="shopAdmin__button shopAdmin__button--primary"
                                    disabled={saving}
                                    onClick={(event) => onMarkPaid(event.currentTarget)}
                                >
                                    {saving ? "Saving…" : "Mark paid"}
                                </button>
                            )}
                            <ContactMenu order={order} contact={contact} saving={saving} onFollowUp={onFollowUp} />
                            {actions.length > 0 && <ActionsMenu label="More actions" actions={actions} disabled={saving} />}
                        </div>
                    )}

                    <section className="shopAdmin__section">
                        <h3>Payment</h3>
                        <PaymentSummary order={order} onEnterAmount={item && !saving ? onEnterAmount : null} />
                    </section>

                    <section className="shopAdmin__section">
                        <h3>Items</h3>
                        <table className="shopAdmin__lines">
                            <caption className="sr-only">Items in order {orderReference(order)}</caption>
                            <thead>
                                <tr>
                                    <th scope="col">Item</th>
                                    <th scope="col" className="shopAdmin__number">Qty</th>
                                    <th scope="col" className="shopAdmin__number">Price</th>
                                    <th scope="col" className="shopAdmin__number">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {purchasedProducts(order).map((product) => (
                                    <tr key={product.key}>
                                        <td>{product.name}</td>
                                        <td className="shopAdmin__number">{product.quantity}</td>
                                        <td className="shopAdmin__number">{formatCents(product.unitPriceCents)}</td>
                                        <td className="shopAdmin__number">{formatCents(product.totalCents)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <th scope="row" colSpan={3}>Total</th>
                                    <td className="shopAdmin__number">{formatCents(order.totalCents)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </section>

                    <section className="shopAdmin__section">
                        <h3>Details</h3>
                        <dl className="shopAdmin__facts" role="group" aria-label="Details">
                            <div><dt>Venmo</dt><dd>@{order.venmoUsername}</dd></div>
                            <div><dt>Customer</dt><dd>{buyerLabel(order)}</dd></div>
                            <div><dt>Order</dt><dd>{orderReference(order)}</dd></div>
                            <div><dt>Confirmed</dt><dd>{formatDateTime(order.confirmedAt)}</dd></div>
                        </dl>
                    </section>

                    <section className="shopAdmin__section">
                        <div className="shopAdmin__sectionHeading">
                            <h3>Activity</h3>
                            {item && (
                                <button
                                    type="button"
                                    className="shopAdmin__button shopAdmin__button--small"
                                    disabled={saving}
                                    onClick={(event) => onAddToLog(event.currentTarget)}
                                >
                                    <span aria-hidden="true">+</span> Add to log
                                </button>
                            )}
                        </div>
                        <ul className="shopAdmin__activity" aria-label="Activity">
                            {[...order.history].reverse().map((entry, index) => (
                                <li key={`${entry.at}-${index}`}>
                                    <div>
                                        {historyText(entry)}
                                        {entry.note && <p className="shopAdmin__note">“{entry.note}”</p>}
                                    </div>
                                    <span className="shopAdmin__muted">{formatDateTime(entry.at)}</span>
                                </li>
                            ))}
                            <li>
                                {order.buyer?.name ? `${order.buyer.name} confirmed the order` : "Order confirmed"}
                                <span className="shopAdmin__muted">{formatDateTime(order.confirmedAt)}</span>
                            </li>
                        </ul>
                    </section>
                </div>
            )}
        </dialog>
    );
}

/*
 * @behavior One order per table body, amount first: amount and status, Venmo, customer, items, date, then
 *           Mark paid and the "···" menu. A notice appears on a full-width line beneath, so it never squeezes
 *           the row. Clicking the row or the customer opens the drawer.
 */
function OrderRow({ item, checked, open, actions, onCheck, onOpen, onMarkPaid, buyerButtonRef }) {
    const { order, notice, saving } = item;
    const selectable = canMarkPaid(order);
    const rowClass = ["shopAdmin__row", checked && "shopAdmin__row--checked", open && "shopAdmin__row--open"].filter(Boolean).join(" ");

    const openFromRow = (event) => {
        if (!event.target.closest("button, a, input, label, [role='menu']")) onOpen();
    };

    return (
        <tbody className="shopAdmin__order">
            <tr className={rowClass} onClick={openFromRow}>
                <td className="shopAdmin__select">
                    {selectable && (
                        <input
                            type="checkbox"
                            aria-label={`Select ${buyerLabel(order)}'s order`}
                            checked={checked}
                            disabled={saving}
                            onChange={(event) => onCheck(event.target.checked)}
                        />
                    )}
                </td>
                <td className="shopAdmin__amountCell">
                    <div className="shopAdmin__amountStack">
                        <span className="shopAdmin__amountLine">
                            <span className="shopAdmin__amount">{formatCents(order.totalCents)}</span>
                            <StatusBadge order={order} />
                            <PickupTag order={order} />
                            <AfterPickupTag order={order} />
                            <FollowUpTag order={order} />
                        </span>
                        <PaymentProgress order={order} />
                    </div>
                </td>
                <td className="shopAdmin__venmo">@{order.venmoUsername}</td>
                <td className="shopAdmin__customer">
                    <button type="button" className="shopAdmin__customerButton" ref={buyerButtonRef} onClick={onOpen}>
                        {buyerLabel(order)}
                    </button>
                </td>
                <td className="shopAdmin__items">{itemSummary(order)}</td>
                <td className="shopAdmin__date">{formatDateTime(order.confirmedAt)}</td>
                <td className="shopAdmin__rowActions">
                    {selectable && (
                        <button
                            type="button"
                            className="shopAdmin__button shopAdmin__button--small"
                            disabled={saving}
                            onClick={(event) => onMarkPaid(event.currentTarget)}
                        >
                            {saving ? "Saving…" : "Mark paid"}
                        </button>
                    )}
                    {actions.length > 0 && <ActionsMenu label={`More actions for ${buyerLabel(order)}'s order`} actions={actions} disabled={saving} />}
                </td>
            </tr>
            {notice && (
                <tr className="shopAdmin__rowNotice">
                    <td colSpan={TABLE_COLUMNS}><p className="shopAdmin__notice" role="alert">{notice}</p></td>
                </tr>
            )}
        </tbody>
    );
}

/*
 * @behavior While locked, the page behind the drawer or a dialog does not scroll and gives up the strip it
 *           keeps for its scrollbar, so the drawer reaches the window's edge. The page is padded by exactly
 *           the width it gained, measured rather than assumed, so the dimmed page never shifts sideways.
 *           The width is html's layout box, not clientWidth: on a list too short to scroll, clientWidth
 *           ignores the strip that scrollbar-gutter: stable still reserves, and the page jumped by its width.
 *           The lock is set on body, which hands it to the window; locking html instead would make body a
 *           scroll container and unstick the admin bar. Unlocking restores the page as it was.
 */
function useLockPageScroll(locked) {
    useEffect(() => {
        if (!locked) return undefined;
        const root = document.documentElement;
        const { body } = document;
        const previous = { overflow: body.style.overflow, gutter: root.style.scrollbarGutter, padding: body.style.paddingRight };
        const widthBefore = root.getBoundingClientRect().width;
        body.style.overflow = "hidden";
        root.style.scrollbarGutter = "auto";
        body.style.paddingRight = `${root.getBoundingClientRect().width - widthBefore}px`;
        return () => {
            body.style.overflow = previous.overflow;
            root.style.scrollbarGutter = previous.gutter;
            body.style.paddingRight = previous.padding;
        };
    }, [locked]);
}

export default function ShopOrdersPage() {
    const { isAuthenticated, authLoading, user, signIn } = useAuthContext();
    const [filters, setFilters] = useState(INITIAL_FILTERS);
    const [searchText, setSearchText] = useState("");
    const [view, setView] = useState("loading");
    const [items, setItems] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [result, setResult] = useState(NO_RESULT);
    const announcement = result.text;
    // Each result replaces the last, so an older Undo or retry offer goes with it.
    const setAnnouncement = useCallback((text, offers = {}) => setResult({ ...NO_RESULT, text, ...offers }), []);
    // A failure is shown in the warning style; the text itself is the same single status line either way.
    const resultClass = announcement
        ? `shopAdmin__result${result.tone === "warning" ? " shopAdmin__result--warning" : ""}`
        : "shopAdmin__resultSlot";
    const [reloadKey, setReloadKey] = useState(0);
    const [summary, setSummary] = useState(null);
    const [countsKey, setCountsKey] = useState(0);
    const [checkedIds, setCheckedIds] = useState(() => new Set());
    const [openId, setOpenId] = useState(null);
    const [detail, setDetail] = useState(null);
    // The confirmation on screen: { kind, itemId, returnFocusTo }, or null.
    const [modal, setModal] = useState(null);
    // { current, total } while selected orders are being marked paid one by one; null otherwise.
    const [bulkProgress, setBulkProgress] = useState(null);
    const bulkSaving = bulkProgress !== null;
    const bulkSaveInProgress = useRef(false);
    const generation = useRef(0);
    // First pages already seen, by request URL. Emptied after any saved change, so nothing outdated shows.
    const recentPages = useRef(new Map());
    const tabRefs = useRef({});
    const buyerButtons = useRef({});
    const focusBuyerOf = useRef(null);

    // A different account never sees the previous account's orders, even briefly.
    useEffect(() => {
        recentPages.current.clear();
        setItems([]);
        setNextCursor(null);
    }, [isAuthenticated, user]);

    /*
     * @behavior Loads the first page for the current filter and search. The orders on screen stay until the
     *           answer arrives, so switching filters or typing doesn't blank the table; a first page seen
     *           moments ago shows at once and refreshes quietly. A request still in flight is cancelled when
     *           a newer one replaces it, and any late answer is ignored.
     */
    useEffect(() => {
        const current = ++generation.current;
        setLoadingMore(false);
        setNextCursor(null);
        setAnnouncement("");
        setCheckedIds(new Set());
        setModal(null);
        setOpenId(null);
        setDetail(null);
        if (!isAuthenticated) {
            setView("signedOut");
            return undefined;
        }
        const url = listUrl(filters);
        const showPage = (page) => {
            setItems(toItems(page.purchases));
            setNextCursor(page.nextCursor);
            setView("ready");
        };
        const remembered = recentPages.current.get(url);
        if (remembered) showPage(remembered);
        else setView((previous) => (previous === "ready" ? "ready" : "loading"));
        setRefreshing(true);

        const controller = new AbortController();
        let finished = false;
        (async () => {
            try {
                const response = await fetch(url, { signal: controller.signal });
                const body = await readJson(response);
                if (current !== generation.current) return;
                if (response.status === 401) return setView("signedOut");
                if (response.status === 403) return setView("forbidden");
                if (!response.ok) return setView("error");
                const page = { purchases: body.purchases, nextCursor: body.nextCursor };
                recentPages.current.set(url, page);
                showPage(page);
            } catch {
                if (current === generation.current && !controller.signal.aborted) setView("error");
            } finally {
                finished = true;
                if (current === generation.current) setRefreshing(false);
            }
        })();
        return () => {
            if (!finished) controller.abort();
        };
    }, [isAuthenticated, user, filters, reloadKey]);

    // A different account, or signing out, never sees the previous account's numbers.
    useEffect(() => {
        setSummary(null);
    }, [isAuthenticated, user]);

    // Counts and totals are a convenience: when they can't load, filters show labels only and the overview hides.
    // A refresh after a saved change keeps the numbers on screen, since they were true a moment ago; if that
    // refresh fails, the last numbers stay. On a first load that fails there are none, so the overview stays hidden.
    useEffect(() => {
        let active = true;
        if (!isAuthenticated) return undefined;
        (async () => {
            try {
                const response = await fetch(`${API}/counts`);
                const body = await readJson(response);
                if (active && response.ok) setSummary({ counts: body.counts, totals: body.totals });
            } catch {
                // Keeps the last numbers, as described above.
            }
        })();
        return () => {
            active = false;
        };
    }, [isAuthenticated, user, countsKey]);

    // The drawer reads the order again for the buyer's phone number, which the list leaves out.
    useEffect(() => {
        if (!openId) return undefined;
        let active = true;
        setDetail({ id: openId, order: null, status: "loading" });
        (async () => {
            try {
                const response = await fetch(`${API}/${openId}`);
                const body = await readJson(response);
                if (!active) return;
                setDetail(response.ok ? { id: openId, order: body.purchase, status: "ready" } : { id: openId, order: null, status: "error" });
            } catch {
                if (active) setDetail({ id: openId, order: null, status: "error" });
            }
        })();
        return () => {
            active = false;
        };
    }, [openId]);

    // Search follows typing after a short pause, so each keystroke doesn't start a request.
    useEffect(() => {
        const q = searchText.trim();
        const timer = setTimeout(() => {
            setFilters((previous) => (previous.q === q ? previous : { ...previous, q }));
        }, SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [searchText]);

    useEffect(() => {
        if (openId === null && focusBuyerOf.current) {
            buyerButtons.current[focusBuyerOf.current]?.focus();
            focusBuyerOf.current = null;
        }
    }, [openId]);

    const loadMore = async () => {
        const current = generation.current;
        setLoadingMore(true);
        try {
            const response = await fetch(listUrl(filters, nextCursor));
            const body = await readJson(response);
            if (current !== generation.current) return;
            if (!response.ok) {
                setAnnouncement(body?.message || "Couldn't load more orders. Try again.");
                return;
            }
            setItems((previous) => [...previous, ...toItems(body.purchases)]);
            setNextCursor(body.nextCursor);
        } catch {
            if (current === generation.current) setAnnouncement("Couldn't load more orders. Try again.");
        } finally {
            if (current === generation.current) setLoadingMore(false);
        }
    };

    const updateItem = useCallback((id, change) => {
        setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...change } : item)));
    }, []);

    // Single-order responses carry the phone number, so they also refresh an open drawer.
    const showSavedOrder = useCallback((order) => {
        setDetail((previous) => (previous?.id === order.id ? { id: order.id, order, status: "ready" } : previous));
    }, []);

    // Shows the order's latest saved state with a notice, for a fresh review after a conflict or lost response.
    const refreshOrder = useCallback(async (id, notice, current) => {
        updateItem(id, { notice, saving: false });
        try {
            const response = await fetch(`${API}/${id}`);
            const body = await readJson(response);
            if (current === generation.current && response.ok) {
                updateItem(id, { order: body.purchase });
                showSavedOrder(body.purchase);
            }
        } catch {
            // The notice already asks the officer to review before trying again.
        }
    }, [showSavedOrder, updateItem]);

    /*
     * @behavior Sends one decision for one order and updates it from the server's answer. Nothing is retried.
     *           The server's answer stands even if the officer changed the filter meanwhile: a saved decision is
     *           reported as saved, and updates are matched by order id, so a list that no longer shows the order
     *           is left alone.
     * @returns { order } when saved, or { message } when it was not
     */
    const sendDecision = useCallback(async (item, path, payload, method = "PATCH") => {
        const current = generation.current;
        updateItem(item.id, { saving: true, notice: null });
        let response;
        let body;
        try {
            response = await fetch(`${API}/${item.id}/${path}`, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...payload, expectedRevision: item.order.revision }),
            });
            body = await readJson(response);
        } catch {
            if (current === generation.current) refreshOrder(item.id, LOST_RESPONSE_MESSAGE, current);
            return { message: LOST_RESPONSE_MESSAGE };
        }
        if (!response.ok) {
            const message = body?.message || GENERIC_FAILURE;
            if (response.status === 409) refreshOrder(item.id, message, current);
            else updateItem(item.id, { saving: false, notice: message });
            return { message };
        }
        const order = body.purchase;
        recentPages.current.clear();
        showSavedOrder(order);
        setCountsKey((key) => key + 1);
        return { order };
    }, [refreshOrder, showSavedOrder, updateItem]);

    // Keeps a changed order in the table while it still matches the filter; otherwise leaves a result line.
    const placeSavedOrder = useCallback((id, order, resultText) => {
        updateItem(id, matchesFilter(order, filters.filter)
            ? { order, saving: false, notice: null }
            : { order: null, result: resultText, saving: false, notice: null });
    }, [filters, updateItem]);

    const decide = useCallback(async (item, path, payload, describe, method, undoable = false) => {
        setAnnouncement("");
        const { order } = await sendDecision(item, path, payload, method);
        if (!order) return;
        const text = describe(order);
        setAnnouncement(text, undoable ? { undo: { item: { id: item.id, order } } } : {});
        placeSavedOrder(item.id, order, text);
    }, [placeSavedOrder, sendDecision, setAnnouncement]);

    const paidText = (order) => `Marked paid: ${buyerLabel(order)}, ${formatCents(order.totalCents)}`;

    const setPayment = (item, status, note = "") => decide(
        item,
        "payment",
        { status, ...(note && { note }) },
        (order) => `${RESULT_TEXT[status]}: ${buyerLabel(order)}, ${formatCents(order.totalCents)}`,
    );

    // Unconfirmed and Paid hold the same stock, so Undo of a mark paid needs no confirmation. Only an order that was
    // unconfirmed gets it; a dropped order would take its items again.
    // An order that was picked up needs a reason to move back to Unconfirmed, which Undo does not ask for.
    const markPaid = (item) => decide(
        item,
        "payment",
        { status: "paid" },
        paidText,
        undefined,
        item.order.status === "pending" && !item.order.pickup.pickedUpAt,
    );

    // Moves a just-marked order back to Unconfirmed, at the revision the mark-paid answer saved.
    const undoMarkPaid = async (item) => {
        setAnnouncement("");
        const { order, message } = await sendDecision(item, "payment", { status: "pending" });
        if (!order) {
            setAnnouncement(message, { tone: "warning" });
            return;
        }
        const text = `${RESULT_TEXT.pending}: ${buyerLabel(order)}, ${formatCents(order.totalCents)}`;
        setAnnouncement(text);
        placeSavedOrder(item.id, order, text);
    };

    const setAmount = (item, amountReceivedCents) => decide(
        item,
        "amount-received",
        { amountReceivedCents },
        (order) => (order.status === "paid" ? paidText(order) : `Recorded ${formatCents(order.amountReceivedCents)} received: ${buyerLabel(order)}`),
    );

    const setFollowUp = (item, followUpStatus, note = "") => decide(
        item,
        "follow-up",
        { followUpStatus, ...(note && { note }) },
        (order) => `${followUpStatus === "none" ? "Cleared follow-up" : "Logged follow-up"}: ${buyerLabel(order)}`,
    );

    const addNote = (item, title, note) => decide(
        item,
        "notes",
        { title, ...(note && { note }) },
        (order) => `Added to log: ${buyerLabel(order)}`,
        "POST",
    );

    const openModal = (kind, item, returnFocusTo) => setModal({ kind, itemId: item?.id ?? null, returnFocusTo });

    const closeModal = () => {
        const target = modal?.returnFocusTo;
        setModal(null);
        if (target?.isConnected) target.focus();
    };

    // The drawer's "···" holds only rare actions; its amount and log controls sit by the figures they change.
    // Change status is here too, where officers look first, as well as on the status badge.
    const rareActionsFor = (item) => [
        { label: "Change status…", onSelect: (from) => openModal("status", item, from) },
        item.order.status === "pending" && { label: "Drop unconfirmed order", danger: true, onSelect: (from) => openModal("drop", item, from) },
        item.order.status === "paid" && { label: "Record refund", danger: true, onSelect: (from) => openModal("refund", item, from) },
    ].filter(Boolean);

    // A row's "···" also offers entering the amount, so a partial payment can be recorded without the drawer.
    const rowActionsFor = (item) => [
        canMarkPaid(item.order) && { label: "Enter amount received", onSelect: (from) => openModal("amount", item, from) },
        ...rareActionsFor(item),
    ].filter(Boolean);

    // Only orders that can still be marked paid count as selected, so an order whose status changed after
    // it was checked (by this officer or another) is never sent with the others.
    const checkedItems = items.filter((item) => item.order && canMarkPaid(item.order) && checkedIds.has(item.id));
    const checkedTotal = checkedItems.reduce((sum, item) => sum + item.order.totalCents, 0);
    // Failed orders that can still be marked paid, which is what "Select the N that failed" selects again.
    const retryItems = items.filter((item) => item.order && canMarkPaid(item.order) && result.retryIds.includes(item.id));

    // Marks each selected order paid with its own request and revision, then reports any that failed by name.
    const markCheckedPaid = async () => {
        if (bulkSaveInProgress.current) return;
        bulkSaveInProgress.current = true;
        setAnnouncement("");
        const chosen = checkedItems;
        const failures = [];
        const failedIds = [];
        try {
            for (const [index, item] of chosen.entries()) {
                setBulkProgress({ current: index + 1, total: chosen.length });
                const { order, message } = await sendDecision(item, "payment", { status: "paid" });
                if (order) {
                    placeSavedOrder(item.id, order, paidText(order));
                } else {
                    failures.push(`Couldn't mark ${buyerLabel(item.order)}'s order: ${message}`);
                    failedIds.push(item.id);
                }
            }
            setCheckedIds(new Set());
            const marked = chosen.length - failures.length;
            setAnnouncement(failures.length === 0
                ? `Marked ${marked} ${marked === 1 ? "order" : "orders"} paid.`
                : `Marked ${marked} of ${chosen.length} orders paid. ${failures.join(" ")}`,
            failures.length === 0 ? {} : { retryIds: failedIds, tone: "warning" });
        } finally {
            bulkSaveInProgress.current = false;
            setBulkProgress(null);
        }
    };

    const setChecked = (id, checked) => {
        setCheckedIds((previous) => {
            const next = new Set(previous);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const closeDetails = () => {
        focusBuyerOf.current = openId;
        setOpenId(null);
        setDetail(null);
    };

    const chooseFilter = (filter) => setFilters((previous) => ({ ...previous, filter }));

    const onTabKeyDown = (event, index) => {
        const offsets = { ArrowRight: 1, ArrowLeft: -1 };
        let nextIndex = null;
        if (event.key in offsets) nextIndex = (index + offsets[event.key] + FILTERS.length) % FILTERS.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = FILTERS.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        const next = FILTERS[nextIndex].value;
        chooseFilter(next);
        tabRefs.current[next]?.focus();
    };

    useLockPageScroll(openId !== null || modal !== null);

    if (authLoading) return null;

    const showOrders = view !== "signedOut" && view !== "forbidden";
    const openItem = items.find((item) => item.id === openId && item.order);
    const detailOrder = (detail?.id === openId && detail.order) || openItem?.order || null;
    const contact = {
        status: detail?.status ?? "loading",
        phone: detail?.order?.buyer?.phone ?? null,
    };
    const checkedCount = checkedItems.length;
    const modalItem = modal?.itemId ? items.find((item) => item.id === modal.itemId && item.order) : null;
    const listedCount = items.filter((item) => item.order).length;

    const modalContent = () => {
        if (modal?.kind === "bulk") {
            return {
                title: `Mark ${plural(checkedCount, "order", "orders")} paid?`,
                body: (close) => (
                    <>
                        <p>{formatCents(checkedTotal)} in total. Only do this after finding every payment in IUGA's Venmo.</p>
                        <ModalButtons close={close} confirmLabel={`Mark ${checkedCount} paid`} onConfirm={markCheckedPaid} />
                    </>
                ),
            };
        }
        if (!modalItem) return null;
        const { order } = modalItem;
        const amount = formatCents(order.totalCents);
        const whose = order.buyer?.name ? `${order.buyer.name}'s` : "this";
        if (modal.kind === "paid") {
            return {
                title: `Mark ${amount} as paid?`,
                body: (close) => (
                    <>
                        <p>{markPaidNote(order)}</p>
                        <ModalButtons close={close} confirmLabel="Mark paid" onConfirm={() => markPaid(modalItem)} />
                    </>
                ),
            };
        }
        if (modal.kind === "amount") {
            return {
                title: "Amount received",
                body: (close) => <AmountForm order={order} close={close} onSave={(cents) => setAmount(modalItem, cents)} />,
            };
        }
        if (modal.kind === "followUp") {
            return {
                title: `Log follow-up for ${buyerLabel(order)}`,
                body: (close) => (
                    <FollowUpForm
                        order={order}
                        close={close}
                        onSave={(choice, note, topic) => (choice === "other" ? addNote(modalItem, topic, note) : setFollowUp(modalItem, choice, note))}
                    />
                ),
            };
        }
        if (modal.kind === "status") {
            return {
                title: `Change status of ${whose} order`,
                body: (close) => (
                    <StatusChangeForm order={order} close={close} onConfirm={(to, reason) => setPayment(modalItem, to, reason)} />
                ),
            };
        }
        const pickedUp = Boolean(order.pickup.pickedUpAt);
        if (modal.kind === "drop") {
            return {
                title: `Drop ${whose} ${amount} order?`,
                body: (close) => (
                    <>
                        {pickedUp && <PickupWarning order={order} />}
                        <p>Use this only if no matching Venmo payment came.</p>
                        <p>Returns to stock: {itemSummary(order)}.</p>
                        <p>The student's purchase allowance is restored. This does not refund a Venmo payment.</p>
                        <p>If this was a mistake, change its status from the order; taking the items again works only if they still fit.</p>
                        {pickedUp ? (
                            <ReasonConfirm close={close} danger confirmLabel="Drop unconfirmed order" onConfirm={(reason) => setPayment(modalItem, "not_paid", reason)} />
                        ) : (
                            <ModalButtons close={close} danger confirmLabel="Drop unconfirmed order" onConfirm={() => setPayment(modalItem, "not_paid")} />
                        )}
                    </>
                ),
            };
        }
        return {
            title: `Record refund for ${whose} ${amount} order?`,
            body: (close) => (
                <>
                    {pickedUp && <PickupWarning order={order} />}
                    <p>Send the refund in Venmo first; this site does not move money.</p>
                    <p>Items return to stock and the student's allowance is restored. If this was a mistake, change its status from the order.</p>
                    {pickedUp ? (
                        <ReasonConfirm close={close} danger confirmLabel="Record refund" onConfirm={(reason) => setPayment(modalItem, "refunded", reason)} />
                    ) : (
                        <ModalButtons close={close} danger confirmLabel="Record refund" onConfirm={() => setPayment(modalItem, "refunded")} />
                    )}
                </>
            ),
        };
    };
    const shownModal = modal ? modalContent() : null;

    return (
        <div className="shopAdmin">
            <AdminBar />
            <main className="shopAdmin__main">
                <div className="shopAdmin__heading">
                    <h1 className="shopAdmin__title">Orders</h1>
                    <p className="shopAdmin__muted">Match each order to a payment in IUGA's Venmo. Oldest first.</p>
                </div>

                {view === "signedOut" && (
                    <section className="shopAdmin__panel">
                        <h2>Sign in to review orders</h2>
                        <p>This page is for IUGA officers who review shop orders.</p>
                        <button type="button" className="shopAdmin__button shopAdmin__button--primary" onClick={signIn}>
                            Sign in with UW NetID
                        </button>
                    </section>
                )}

                {view === "forbidden" && (
                    <section className="shopAdmin__panel">
                        <h2>No access to orders</h2>
                        <p>This page is for IUGA officers who review shop orders.</p>
                        <p>Ask an officer who manages roles to give you order review access.</p>
                    </section>
                )}

                {showOrders && (
                    <>
                        {summary?.totals && <Overview counts={summary.counts} totals={summary.totals} onChooseFilter={chooseFilter} />}

                        <div className="shopAdmin__toolbar">
                        <div role="tablist" aria-label="Filter orders" className="shopAdmin__filters">
                            {FILTERS.map((tab, index) => {
                                const selected = filters.filter === tab.value;
                                return (
                                    <button
                                        key={tab.value}
                                        type="button"
                                        role="tab"
                                        id={`shopOrdersTab-${tab.value}`}
                                        aria-selected={selected}
                                        aria-controls="shopOrdersList"
                                        tabIndex={selected ? 0 : -1}
                                        ref={(node) => { tabRefs.current[tab.value] = node; }}
                                        className="shopAdmin__filter"
                                        onClick={() => chooseFilter(tab.value)}
                                        onKeyDown={(event) => onTabKeyDown(event, index)}
                                    >
                                        {tab.label}
                                        {summary && (
                                            <>
                                                {" "}
                                                <span className={tab.value === "awaiting" && summary.counts.awaiting > 0 ? "shopAdmin__filterCount shopAdmin__filterCount--waiting" : "shopAdmin__filterCount"}>
                                                    {summary.counts[tab.value]}
                                                </span>
                                            </>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <form
                            className="shopAdmin__search"
                            role="search"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setFilters((previous) => ({ ...previous, q: searchText.trim() }));
                            }}
                        >
                            <label htmlFor="shopOrdersSearch" className="sr-only">Search by Venmo, name, or email</label>
                            <div className="shopAdmin__searchField">
                                <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                                <input
                                    id="shopOrdersSearch"
                                    type="search"
                                    maxLength={120}
                                    placeholder="Search by Venmo, name, or email"
                                    value={searchText}
                                    onChange={(event) => setSearchText(event.target.value)}
                                />
                            </div>
                        </form>
                        </div>

                        <div className={resultClass}>
                            <span role="status" className={announcement ? "shopAdmin__resultText" : "sr-only"}>{announcement}</span>
                            {result.undo && (
                                <button
                                    type="button"
                                    className="shopAdmin__button"
                                    aria-label={`Undo mark paid for ${buyerLabel(result.undo.item.order)}`}
                                    onClick={() => undoMarkPaid(result.undo.item)}
                                >
                                    Undo
                                </button>
                            )}
                            {retryItems.length > 0 && (
                                <button type="button" className="shopAdmin__button" onClick={() => setCheckedIds(new Set(retryItems.map((item) => item.id)))}>
                                    {`Select the ${retryItems.length} that failed`}
                                </button>
                            )}
                        </div>

                        <section
                            id="shopOrdersList"
                            role="tabpanel"
                            aria-labelledby={`shopOrdersTab-${filters.filter}`}
                            aria-busy={refreshing}
                            className={refreshing ? "shopAdmin__list shopAdmin__list--refreshing" : "shopAdmin__list"}
                        >
                            {(view === "loading" || (view === "ready" && refreshing && items.length === 0)) && (
                                <p className="shopAdmin__panel">Loading orders…</p>
                            )}
                            {view === "error" && (
                                <div className="shopAdmin__panel">
                                    <p>Couldn't load orders. No changes were made.</p>
                                    <button type="button" className="shopAdmin__button" onClick={() => setReloadKey((key) => key + 1)}>
                                        Try again
                                    </button>
                                </div>
                            )}
                            {view === "ready" && !refreshing && items.length === 0 && (
                                <div className="shopAdmin__panel">
                                    <p>{emptyMessage(filters)}</p>
                                    {filters.q && filters.filter !== "all" && (
                                        <button type="button" className="shopAdmin__button" onClick={() => chooseFilter("all")}>
                                            Search all orders
                                        </button>
                                    )}
                                </div>
                            )}
                            {view === "ready" && items.length > 0 && (
                                <div className="shopAdmin__tableWrap">
                                    <table className="shopAdmin__table">
                                        <caption className="sr-only">Orders</caption>
                                        <thead>
                                            <tr>
                                                <th scope="col" className="shopAdmin__select"><span className="sr-only">Select</span></th>
                                                <th scope="col">Amount</th>
                                                <th scope="col">Venmo</th>
                                                <th scope="col">Customer</th>
                                                <th scope="col">Items</th>
                                                <th scope="col">Date</th>
                                                <th scope="col"><span className="sr-only">Actions</span></th>
                                            </tr>
                                        </thead>
                                        {items.map((item) => (item.order ? (
                                            <OrderRow
                                                key={item.id}
                                                item={item}
                                                checked={checkedIds.has(item.id)}
                                                open={item.id === openId}
                                                actions={rowActionsFor(item)}
                                                onCheck={(checked) => setChecked(item.id, checked)}
                                                onOpen={() => setOpenId(item.id)}
                                                onMarkPaid={(from) => openModal("paid", item, from)}
                                                buyerButtonRef={(node) => { buyerButtons.current[item.id] = node; }}
                                            />
                                        ) : (
                                            <tbody key={item.id} className="shopAdmin__order">
                                                <tr className="shopAdmin__resultRow">
                                                    <td colSpan={TABLE_COLUMNS}>{item.result}</td>
                                                </tr>
                                            </tbody>
                                        )))}
                                    </table>
                                </div>
                            )}
                            {view === "ready" && items.length > 0 && (
                                <div className="shopAdmin__listFooter">
                                    <span className="shopAdmin__muted">{plural(listedCount, "order", "orders")}, oldest first</span>
                                    {nextCursor && (
                                        <button type="button" className="shopAdmin__button" disabled={loadingMore} onClick={loadMore}>
                                            {loadingMore ? "Loading…" : "Load more orders"}
                                        </button>
                                    )}
                                </div>
                            )}
                        </section>

                        {(checkedCount > 0 || bulkSaving) && (
                            <div className="shopAdmin__selectionBar" role="region" aria-label="Selected orders">
                                <span className="shopAdmin__selectionCount">
                                    {bulkSaving ? `Marking ${bulkProgress.current} of ${bulkProgress.total}…` : `${checkedCount} selected`}
                                </span>
                                {!bulkSaving && <span className="shopAdmin__selectionTotal">{formatCents(checkedTotal)} total</span>}
                                <div className="shopAdmin__selectionButtons">
                                    <button type="button" className="shopAdmin__button" disabled={bulkSaving} onClick={() => setCheckedIds(new Set())}>Clear</button>
                                    <button
                                        type="button"
                                        className="shopAdmin__button shopAdmin__button--primary"
                                        disabled={bulkSaving}
                                        onClick={(event) => openModal("bulk", null, event.currentTarget)}
                                    >
                                        {bulkSaving ? "Saving…" : `Mark ${checkedCount} paid`}
                                    </button>
                                </div>
                            </div>
                        )}

                        <OrderDrawer
                            order={detailOrder}
                            item={openItem}
                            contact={contact}
                            actions={openItem ? rareActionsFor(openItem) : []}
                            onMarkPaid={(from) => openItem && openModal("paid", openItem, from)}
                            onEnterAmount={(from) => openItem && openModal("amount", openItem, from)}
                            onAddToLog={(from) => openItem && openModal("followUp", openItem, from)}
                            onFollowUp={(followUpStatus) => openItem && setFollowUp(openItem, followUpStatus)}
                            onChangeStatus={(from) => openItem && openModal("status", openItem, from)}
                            onClose={closeDetails}
                        />
                    </>
                )}

                <Modal open={Boolean(shownModal)} title={shownModal?.title} onClose={closeModal}>
                    {(close) => shownModal.body(close)}
                </Modal>
            </main>
        </div>
    );
}
