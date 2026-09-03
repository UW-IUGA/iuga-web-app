/*
 * Purpose: Present a blocking message that requires explicit acknowledgment.
 * Authentication/Authorization Requirements: None; callers decide when it is shown.
 * Expected Request: Content labels and an acknowledgment callback from the caller.
 * Expected Response: An accessible dialog that invokes onConfirm when acknowledged.
 */
function AlertDialog({ eyebrow, title, message, confirmLabel = "Okay", onConfirm }) {
    return (
        <div className="alert-dialog-overlay">
            <section
                className="alert-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-message"
            >
                {eyebrow ? <span className="alert-dialog-eyebrow">{eyebrow}</span> : null}
                <h2 id="alert-dialog-title">{title}</h2>
                <p id="alert-dialog-message">{message}</p>
                <button type="button" className="alert-dialog-confirm primary-button" autoFocus onClick={onConfirm}>
                    {confirmLabel}
                </button>
            </section>
        </div>
    );
}

export default AlertDialog;
