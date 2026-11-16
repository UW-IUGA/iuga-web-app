/*
 * Purpose: The two dropdowns on an order: Contact (the buyer's email and phone, call, and write an email
 *          from a template) and the "···" actions menu, with keyboard support.
 * Expected Request Information: An order, its loaded contact details, and the actions to offer.
 * Expected Response Information: A button with its popover; choosing an item calls its handler.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faEllipsis, faEnvelope, faPhone } from "@fortawesome/free-solid-svg-icons";
import EmailContactDialog from "../EmailContactDialog";
import { usePopover } from "../../hooks/usePopover";
import { emailTemplates } from "../../utils/shopOrders/orderEmails";
import { buyerLabel, orderReference } from "../../utils/shopOrders/orderRules";
import { formatPhone } from "../../utils/shopOrders/orderText";

/*
 * @behavior A Contact button that opens the buyer's email and phone, with call and email templates.
 *           Disabled when the buyer's account no longer exists.
 */
export function ContactMenu({ order, contact, saving, onFollowUp }) {
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
export function ActionsMenu({ label, actions, disabled }) {
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
