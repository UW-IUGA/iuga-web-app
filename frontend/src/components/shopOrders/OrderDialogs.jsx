/*
 * Purpose: The confirmation dialogs of the officer Orders page and the forms inside them: confirm buttons,
 *          a required reason, the amount received, Change status, and Add to log. A dialog only reports
 *          the officer's choice; the page sends the request.
 * Expected Request Information: The order the dialog is about, a close function, and the confirm handler.
 * Expected Response Information: A <dialog> and its form; nothing is sent until the officer confirms.
 */

import { useEffect, useId, useState } from "react";
import { PickupWarning, StatusBadge } from "./OrderTags";
import { useModalDialog } from "../../hooks/useModalDialog";
import { formatCents } from "../../utils/shopFormat";
import { FOLLOW_UP_CHOICES, HOLDS_STOCK, STATUS_LABELS, stockEffect } from "../../utils/shopOrders/orderRules";
import { parseDollars, statusChangeNotes } from "../../utils/shopOrders/orderText";

const MAX_NOTE_LENGTH = 500;

const MAX_TOPIC_LENGTH = 80;

const AMOUNT_HINT = "Enter an amount like 50 or 50.00.";

/*
 * @behavior The reason and the buttons for a change to a picked-up order. Confirm waits until the reason has
 *           text, and the reason is sent trimmed.
 */
export function ReasonConfirm({ close, danger = false, confirmLabel, onConfirm }) {
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
export function Modal({ open, title, onClose, children }) {
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

export function ModalButtons({ close, confirmLabel, danger = false, onConfirm }) {
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
export function AmountForm({ order, close, onSave }) {
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

/*
 * @behavior Changes an order's status, mainly to correct one set by mistake. Lists every other status with
 *           its stock effect; once one is chosen it explains what happens to stock and the amount received,
 *           and warns when a Venmo check is needed. An optional reason is saved with the change. Nothing is
 *           sent until a status is chosen and confirmed; Cancel sends nothing.
 */
export function StatusChangeForm({ order, close, onConfirm }) {
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
export function FollowUpForm({ order, close, onSave }) {
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
