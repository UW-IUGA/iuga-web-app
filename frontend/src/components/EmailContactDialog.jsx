/*
Purpose: Offer a committee contact action that opens the visitor's mail provider
         with a prefilled message, so they can reach a committee lead directly.

Authentication/Authorization Requirements: None; the component only builds
         compose links and never sends mail itself.

Expected Request Information:
- draft: { recipient, subject, body } used to prefill the message.
- title: dialog heading text.
- triggerLabel: label for the button that opens the dialog.

Expected Response Information:
- A trigger button and a dialog linking to Gmail and Outlook compose views.
*/

import { useId, useRef } from "react";

const getGmailComposeHref = ({ recipient, subject, body }) => {
    const params = new URLSearchParams({ view: "cm", fs: "1", to: recipient, su: subject, body });
    return `https://mail.google.com/mail/?${params}`;
};

const getOutlookComposeHref = ({ recipient, subject, body }) => {
    const params = new URLSearchParams({ to: recipient, subject, body });
    return `https://outlook.office.com/mail/deeplink/compose?${params}`;
};

function EmailContactDialog({ draft, title, triggerLabel }) {
    const dialogRef = useRef(null);
    const titleId = useId();
    const messageId = useId();

    return (
        <>
            <button
                className="emailContactDialog__trigger"
                type="button"
                onClick={() => dialogRef.current?.showModal()}
            >
                {triggerLabel}
            </button>
            <dialog
                className="emailContactDialog"
                ref={dialogRef}
                aria-labelledby={titleId}
                aria-describedby={messageId}
            >
                <div className="emailContactDialog__header">
                    <div>
                        <p className="emailContactDialog__label">Contact the committee</p>
                        <h2 id={titleId}>{title}</h2>
                    </div>
                    <button
                        className="emailContactDialog__close"
                        type="button"
                        aria-label="Close contact options"
                        onClick={() => dialogRef.current?.close()}
                    >
                        <span aria-hidden="true">&times;</span>
                    </button>
                </div>

                <dl className="emailContactDialog__draft">
                    <div>
                        <dt>To</dt>
                        <dd>{draft.recipient}</dd>
                    </div>
                    <div>
                        <dt>Subject</dt>
                        <dd>{draft.subject}</dd>
                    </div>
                    <div className="emailContactDialog__message">
                        <dt>Message</dt>
                        <dd id={messageId}>{draft.body}</dd>
                    </div>
                </dl>

                <div className="emailContactDialog__actions">
                    <a
                        className="emailContactDialog__action emailContactDialog__action--gmail"
                        href={getGmailComposeHref(draft)}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Open in Gmail
                    </a>
                    <a
                        className="emailContactDialog__action emailContactDialog__action--outlook"
                        href={getOutlookComposeHref(draft)}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Open in Outlook
                    </a>
                </div>
            </dialog>
        </>
    );
}

export default EmailContactDialog;
