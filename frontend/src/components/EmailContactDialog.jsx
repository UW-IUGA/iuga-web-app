/*
Purpose: Offer a contact action that opens the visitor's mail provider with a
         prefilled message, so they can reach the right IUGA contact directly.

Authentication/Authorization Requirements: None; the component only builds
         compose links and never sends mail itself.

Expected Request Information:
- draft: { recipient, subject, body } used to prefill the message. Not needed when templates is given.
- contextLabel: short line above the heading naming who or what the message is about.
- title: dialog heading text.
- triggerLabel: label for the button that opens the dialog.
- disabled (optional): disables the trigger, for example when there is no address to write to.
- followUp (optional): { confirmLabel, onConfirm }. After a compose link opens, the dialog asks whether
  the email was sent. confirmLabel answers yes and calls onConfirm; "Not sent" closes without calling it.
  Opening a compose link alone never counts as sending.
- triggerClassName (optional): class name for the trigger button, used instead of
  emailContactDialog__trigger, so a page can style the trigger as one of its own buttons.
- templates (optional): [{ id, label, draft, followUp? }]. The dialog shows the selected template's draft and
  followUp and ignores the draft and followUp props. The first template is selected each time the dialog opens.
  With more than one template, a Template select lists them by label; with one, no select is shown.

Expected Response Information:
- A trigger button and a dialog linking to Gmail and Outlook compose views.
*/

import { useEffect, useId, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

const getGmailComposeHref = ({ recipient, subject, body }) => {
    const params = new URLSearchParams({ view: "cm", fs: "1", to: recipient, su: subject, body });
    return `https://mail.google.com/mail/?${params}`;
};

const getOutlookComposeHref = ({ recipient, subject, body }) => {
    const params = new URLSearchParams({ to: recipient, subject, body });
    return `https://outlook.office.com/mail/deeplink/compose?${params}`;
};

function EmailContactDialog({
    draft,
    contextLabel,
    title,
    triggerLabel,
    disabled = false,
    followUp = null,
    triggerClassName = "emailContactDialog__trigger",
    templates = null,
}) {
    const dialogRef = useRef(null);
    const sentQuestionRef = useRef(null);
    const titleId = useId();
    const messageId = useId();
    const templateSelectId = useId();
    const [askingIfSent, setAskingIfSent] = useState(false);
    const [selectedTemplateId, setSelectedTemplateId] = useState(templates?.[0]?.id);

    useEffect(() => {
        if (askingIfSent) sentQuestionRef.current?.focus();
    }, [askingIfSent]);

    // With templates, the selected one supplies the draft and follow-up in place of the props.
    const selectedTemplate = templates
        ? (templates.find((template) => template.id === selectedTemplateId) ?? templates[0])
        : null;
    const activeDraft = selectedTemplate ? selectedTemplate.draft : draft;
    const activeFollowUp = selectedTemplate ? selectedTemplate.followUp : followUp;

    const close = () => dialogRef.current?.close();
    const askIfSent = activeFollowUp ? () => setAskingIfSent(true) : undefined;

    return (
        <>
            <button
                className={triggerClassName}
                type="button"
                disabled={disabled}
                onClick={() => {
                    setSelectedTemplateId(templates?.[0]?.id);
                    dialogRef.current?.showModal();
                }}
            >
                {triggerLabel}
            </button>
            <dialog
                className="emailContactDialog"
                ref={dialogRef}
                aria-labelledby={titleId}
                aria-describedby={messageId}
                onClose={() => setAskingIfSent(false)}
            >
                {askingIfSent ? (
                    <div className="emailContactDialog__sentCheck">
                        <h2 id={titleId} ref={sentQuestionRef} tabIndex={-1}>Did you send the email?</h2>
                        <p id={messageId}>Opening Gmail or Outlook doesn't confirm it was sent.</p>
                        <div className="emailContactDialog__actions">
                            <button className="emailContactDialog__action" type="button" onClick={close}>
                                Not sent
                            </button>
                            <button
                                className="emailContactDialog__action emailContactDialog__action--confirm"
                                type="button"
                                onClick={() => {
                                    activeFollowUp.onConfirm();
                                    close();
                                }}
                            >
                                {activeFollowUp.confirmLabel}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="emailContactDialog__header">
                            <div>
                                <p className="emailContactDialog__label">{contextLabel}</p>
                                <h2 id={titleId}>{title}</h2>
                            </div>
                            <button
                                className="emailContactDialog__close"
                                type="button"
                                aria-label="Close contact options"
                                onClick={close}
                            >
                                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                            </button>
                        </div>

                        {templates && templates.length > 1 && (
                            <div className="emailContactDialog__template">
                                <label className="emailContactDialog__templateLabel" htmlFor={templateSelectId}>
                                    Template
                                </label>
                                <select
                                    className="emailContactDialog__templateSelect"
                                    id={templateSelectId}
                                    value={selectedTemplate.id}
                                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                                >
                                    {templates.map((template) => (
                                        <option key={template.id} value={template.id}>
                                            {template.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <dl className="emailContactDialog__draft">
                            <div>
                                <dt>To</dt>
                                <dd>{activeDraft.recipient}</dd>
                            </div>
                            <div>
                                <dt>Subject</dt>
                                <dd>{activeDraft.subject}</dd>
                            </div>
                            <div className="emailContactDialog__message">
                                <dt>Message</dt>
                                <dd id={messageId}>{activeDraft.body}</dd>
                            </div>
                        </dl>

                        <div className="emailContactDialog__actions">
                            <a
                                className="emailContactDialog__action emailContactDialog__action--gmail"
                                href={getGmailComposeHref(activeDraft)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={askIfSent}
                            >
                                Open in Gmail
                            </a>
                            <a
                                className="emailContactDialog__action emailContactDialog__action--outlook"
                                href={getOutlookComposeHref(activeDraft)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={askIfSent}
                            >
                                Open in Outlook
                            </a>
                        </div>
                    </>
                )}
            </dialog>
        </>
    );
}

export default EmailContactDialog;
