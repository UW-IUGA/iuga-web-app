import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import StatusBadge from "./StatusBadge";
import ReasonModal from "./ReasonModal";
import { apiRequest, canonicalState, centsToDollars, dollarsToCents, formatDate } from "../../utils/eventRequest";

function roomComplete(request) {
    return request.checkpoints?.some((checkpoint) => checkpoint.key === "room" && checkpoint.status === "completed");
}

function PipelineCard({ request, can, onUpdated }) {
    const state = canonicalState(request.status);
    const [busy, setBusy] = useState(false);
    const [reason, setReason] = useState(null);
    const [note, setNote] = useState("");
    const [amount, setAmount] = useState(centsToDollars(request.fundingRequestedCents));
    const [decision, setDecision] = useState("approve");
    const [link, setLink] = useState("");

    const act = async (path, body, method = "POST") => {
        setBusy(true);
        try {
            const data = await apiRequest(`/${request._id}${path}`, {
                method,
                body: body ? JSON.stringify(body) : undefined,
            });
            onUpdated(data.eventRequest);
            toast.success("Request updated.");
        } catch (error) {
            toast.error(error.message);
        } finally {
            setBusy(false);
        }
    };

    const saveMarketing = async () => {
        let parsed;
        try {
            parsed = new URL(link.trim());
            if (parsed.protocol !== "https:") throw new Error("Use a secure OneDrive link.");
        } catch (error) {
            toast.error(error.message || "Enter a valid OneDrive link.");
            return;
        }
        setBusy(true);
        try {
            await apiRequest(`/${request._id}/checklist/marketing`, { method: "PATCH", body: JSON.stringify({ status: "in_progress", link: link.trim() }) });
            const data = await apiRequest(`/${request._id}/marketing-complete`, { method: "POST" });
            onUpdated(data.eventRequest);
            toast.success("Marketing approved. Request moved to Purchases.");
        } catch (error) {
            toast.error(error.message);
        } finally {
            setBusy(false);
        }
    };

    const recordFinance = () => {
        const approvedAmountCents = dollarsToCents(amount);
        if (approvedAmountCents === null || approvedAmountCents === undefined) {
            toast.error("Enter a valid approved amount.");
            return;
        }
        act("/finance", { decision, approvedAmountCents, note: "" });
    };

    const quickAction = () => {
        if (state === "DRAFT" && can("events.requests.edit")) {
            return <button className="cta-secondary" type="button" disabled={busy} onClick={() => act("/submit")}>Submit</button>;
        }
        if (state === "PVP_REVIEW" && can("events.leadership.approve")) {
            return <div className="pipelineCard__actionRow">
                <button className="cta-secondary" type="button" disabled={busy} onClick={() => act("/advance")}>Advance</button>
                <button className="cta-primary" type="button" disabled={busy} onClick={() => setReason("return")}>Return</button>
                <button className="event-ops-danger" type="button" disabled={busy} onClick={() => setReason("reject")}>Reject</button>
            </div>;
        }
        if (state === "AGENDA" && (can("events.meeting.manage") || can("events.operations.manage"))) {
            return <div className="pipelineCard__inline">
                <label className="form-label">Meeting decision<textarea className="form-input" rows="2" value={note} onChange={(event) => setNote(event.target.value)} /></label>
                <button className="cta-secondary" type="button" disabled={busy || !note.trim()} onClick={() => act("/agenda-outcome", { outcome: "proceed", note: note.trim() })}>Record proceed</button>
            </div>;
        }
        if (state === "FINANCE_REVIEW" && can("events.finance.manage")) {
            if (!roomComplete(request)) {
                return <p className="pipelineCard__hint">Book the room before recording funding. <Link to={`/admin/pipeline/${request._id}`}>Open</Link></p>;
            }
            return <div className="pipelineCard__inline">
                <div className="pipelineCard__inlineFields">
                    <label className="form-label">Approved ($)<input className="form-input" inputMode="decimal" value={amount || ""} onChange={(event) => setAmount(event.target.value)} /></label>
                    <label className="form-label">Decision<select className="form-input" value={decision} onChange={(event) => setDecision(event.target.value)}><option value="approve">Approve</option><option value="approve_partial">Partial</option><option value="deny">Deny</option></select></label>
                </div>
                <button className="cta-secondary" type="button" disabled={busy} onClick={recordFinance}>Record decision</button>
            </div>;
        }
        if (state === "MARKETING_QUEUED" && can("events.marketing.manage")) {
            return <div className="pipelineCard__inline">
                <label className="form-label">OneDrive link<input className="form-input" type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://1drv.ms/..." /></label>
                <button className="cta-secondary" type="button" disabled={busy || !link.trim()} onClick={saveMarketing}>Save &amp; advance</button>
            </div>;
        }
        if (state === "SCHEDULED" && !request.publishedEventId) {
            return can("events.publication.manage")
                ? <button className="cta-secondary" type="button" disabled={busy} onClick={() => act("/publish")}>Publish event</button>
                : <p className="pipelineCard__hint">Waiting on the PR director to publish.</p>;
        }
        if (state === "SCHEDULED" && request.publishedEventId) {
            return <Link className="cta-secondary" to={`/admin/pipeline/${request._id}`}>Log purchases →</Link>;
        }
        if (state === "AWAITING_REVIEW") {
            return <Link className="cta-secondary" to={`/admin/pipeline/${request._id}`}>Open review →</Link>;
        }
        return null;
    };

    return (
        <article className="pipelineCard editorial-card">
            <Link className="pipelineCard__title" to={`/admin/pipeline/${request._id}`}>{request.eventName}</Link>
            <p className="pipelineCard__meta">{request.requestingGroup} · {formatDate(request.eventDate || request.proposedStartDate)}</p>
            <StatusBadge status={request.status} />
            <div className="pipelineCard__action">{quickAction()}</div>
            {reason === "return" && <ReasonModal title="Return for revision" label="What should the requester revise?" confirmLabel="Return" onCancel={() => setReason(null)} onConfirm={(comment) => { setReason(null); act("/return", { comment }); }} />}
            {reason === "reject" && <ReasonModal title="Reject request" label="Why is this request rejected?" confirmLabel="Reject" onCancel={() => setReason(null)} onConfirm={(comment) => { setReason(null); act("/reject", { comment }); }} />}
        </article>
    );
}

export default PipelineCard;
