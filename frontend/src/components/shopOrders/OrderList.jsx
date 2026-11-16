/*
 * Purpose: The officer Orders page's overview cards and its order table's columns: the header, the row for
 *          one order, and the line left behind when an order leaves the list.
 * Expected Request Information: Counts and totals from the review API, or one listed order.
 * Expected Response Information: The overview group, the table's <thead>, and a <tbody> per order.
 */

import { ActionsMenu } from "./OrderMenus";
import { AfterPickupTag, FollowUpTag, PaymentProgress, PickupTag, StatusBadge } from "./OrderTags";
import { formatCents, formatDateTime } from "../../utils/shopFormat";
import { buyerLabel, canMarkPaid, itemSummary } from "../../utils/shopOrders/orderRules";
import { plural } from "../../utils/shopOrders/orderText";

// Kept in step with OrderTableHead and OrderRow, so a notice or result line spans the whole row.
const TABLE_COLUMNS = 7;

// The three figures an officer acts on: money on orders not yet confirmed, money received on confirmed (Paid) orders,
// and open follow-ups. Unconfirmed and Follow-up open their tabs. Color marks only money: amber while any is still
// unconfirmed, green for what was confirmed. Refunded orders leave Confirmed, since they are no longer Paid.
export function Overview({ counts, totals, onChooseFilter }) {
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

/*
 * @behavior One order per table body, amount first: amount and status, Venmo, customer, items, date, then
 *           Mark paid and the "···" menu. A notice appears on a full-width line beneath, so it never squeezes
 *           the row. Clicking the row or the customer opens the drawer.
 */
export function OrderRow({ item, checked, open, actions, onCheck, onOpen, onMarkPaid, buyerButtonRef }) {
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

export function OrderTableHead() {
    return (
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
    );
}

// What stays in the table after an order leaves the current list, such as "Added to log: <name>".
export function ResultRow({ result }) {
    return (
        <tbody className="shopAdmin__order">
            <tr className="shopAdmin__resultRow">
                <td colSpan={TABLE_COLUMNS}>{result}</td>
            </tr>
        </tbody>
    );
}
