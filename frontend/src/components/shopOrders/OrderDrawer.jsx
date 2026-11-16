/*
 * Purpose: The drawer that shows one order on the officer Orders page: what is owed and received, the
 *          items, contact, details, and activity, with the actions an officer can take on it.
 * Expected Request Information: The order, its loaded contact details, and the page's action handlers.
 * Expected Response Information: A modal <dialog>; every action goes back to the page through a handler.
 */

import { useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { ActionsMenu, ContactMenu } from "./OrderMenus";
import { AfterPickupTag, StatusBadge, StatusButton } from "./OrderTags";
import { useModalDialog } from "../../hooks/useModalDialog";
import { formatCents, formatDateTime } from "../../utils/shopFormat";
import { buyerLabel, canMarkPaid, changedAfterPickup, FOLLOW_UP_LABELS, orderReference, purchasedProducts } from "../../utils/shopOrders/orderRules";
import { historyText } from "../../utils/shopOrders/orderText";

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
export function OrderDrawer({ order, item, contact, actions, onMarkPaid, onEnterAmount, onAddToLog, onFollowUp, onChangeStatus, onClose }) {
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
