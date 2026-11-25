/*
 * Purpose: Present a blocking message that requires explicit acknowledgment.
 * Authentication/Authorization Requirements: None; callers decide when it is shown.
 * Expected Request: Content labels and an acknowledgment callback from the caller.
 * Expected Response: An accessible dialog that invokes onConfirm when acknowledged.
 */
import { OverlayEntrance } from "./PageEntrance";

function AlertDialog({ title, message, confirmLabel = "Okay", onConfirm }) {
    return (
        <div className="alert-dialog-overlay">
            <OverlayEntrance
                as="section"
                className="alert-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="alert-dialog-title"
                aria-describedby="alert-dialog-message"
            >
                <h2 id="alert-dialog-title">{title}</h2>
                <p id="alert-dialog-message">{message}</p>
                <button type="button" className="alert-dialog-confirm" autoFocus onClick={onConfirm}>
                    {confirmLabel}
                </button>
            </OverlayEntrance>
        </div>
    );
}

export default AlertDialog;
