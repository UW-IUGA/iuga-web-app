/*
 * Purpose: The small status pieces shown beside an order on the officer Orders page: its payment badge
 *          (and the badge as a Change status button), payment progress, follow-up, pickup, and
 *          changed-after-pickup tags, and the warning before changing a picked-up order.
 * Expected Request Information: An order as the review API returns it.
 * Expected Response Information: Inline elements styled by stylesheets/pages/_shop-orders.scss.
 */

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { formatCents, formatDateTime } from "../../utils/shopFormat";
import { canMarkPaid, changedAfterPickup, FOLLOW_UP_LABELS, STATUS_LABELS } from "../../utils/shopOrders/orderRules";
import { formatDate } from "../../utils/shopOrders/orderText";

// Payment status as a small labeled badge: the text names the state, the color only helps scanning.
export function StatusBadge({ order }) {
    return <span className={`shopAdmin__badge shopAdmin__badge--${order.status}`}>{STATUS_LABELS[order.status]}</span>;
}

/*
 * @behavior The order's status badge in the drawer, as a button that opens Change status, so the status
 *           itself is where an officer goes to correct it.
 */
export function StatusButton({ order, disabled, onClick }) {
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
export function PaymentProgress({ order }) {
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
export function FollowUpTag({ order }) {
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
export function PickupTag({ order }) {
    if (order.status !== "paid" || !order.pickup.pickedUpAt) return null;
    return <span className="shopAdmin__pickupTag">Picked up</span>;
}

// Flags an order whose status changed after it was picked up, in warning colors, so it stands out when scanning.
export function AfterPickupTag({ order }) {
    if (!changedAfterPickup(order)) return null;
    return (
        <span className="shopAdmin__afterPickupTag">
            {order.status === "refunded" ? "Refunded after pickup" : "Changed after pickup"}
        </span>
    );
}

// The warning shown before any change that moves a picked-up order away from Paid.
export function PickupWarning({ order }) {
    return (
        <p className="shopAdmin__pickupWarning">
            This order was picked up on {formatDateTime(order.pickup.pickedUpAt)} by {order.pickup.pickedUpBy ?? "an officer"}.
            Only continue if the student returned the merch.
        </p>
    );
}
