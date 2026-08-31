import { useEffect, useRef, useState } from "react";

/*
 * Small blocking prompt for actions that need a written reason (return, reject,
 * table, decline). Replaces window.prompt so the reason is validated, multiline,
 * and styled with the rest of the workspace.
 */
function ReasonModal({ title, label, confirmLabel = "Confirm", onConfirm, onCancel }) {
    const [reason, setReason] = useState("");
    const fieldRef = useRef(null);

    useEffect(() => { fieldRef.current?.focus(); }, []);

    const submit = (event) => {
        event.preventDefault();
        if (!reason.trim()) return;
        onConfirm(reason.trim());
    };

    return (
        <div className="reasonModal" role="dialog" aria-modal="true" aria-label={title}>
            <form className="reasonModal__panel editorial-card" onSubmit={submit}>
                <h3>{title}</h3>
                <label className="form-label">{label}
                    <textarea className="form-input" rows="3" ref={fieldRef} value={reason} onChange={(event) => setReason(event.target.value)} required />
                </label>
                <div className="reasonModal__actions">
                    <button type="button" className="cta-primary" onClick={onCancel}>Cancel</button>
                    <button type="submit" className="cta-secondary" disabled={!reason.trim()}>{confirmLabel}</button>
                </div>
            </form>
        </div>
    );
}

export default ReasonModal;
