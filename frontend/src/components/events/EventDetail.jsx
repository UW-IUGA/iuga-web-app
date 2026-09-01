import { useEffect, useState } from "react";
import { toast } from "react-toastify";
import StatusBadge from "./StatusBadge";
import DecisionHistory from "./DecisionHistory";
import {
    apiRequest,
    CANONICAL_STATES,
    centsToDollars,
    dateValue,
    dollarsToCents,
    eventDateValue,
    formatDate,
    timeValue,
} from "../../utils/eventRequest";

function EventDetail({ request, onUpdate, can, onPurchaseComplete, showHeading = true, showHistory = true }) {
    const [budget, setBudget] = useState({});
    const [booking, setBooking] = useState({});
    const [meetingDecision, setMeetingDecision] = useState("");
    const [marketingLink, setMarketingLink] = useState("");
    const [purchase, setPurchase] = useState({ description: "", vendor: "", amount: "", purchasedAt: new Date().toISOString().slice(0, 10), receiptUrl: "" });

    useEffect(() => {
        setBudget({
            allocated: centsToDollars(request.finance?.allocatedCents ?? (request.status === "FINANCE_REVIEW" ? request.fundingRequestedCents : undefined)),
            actual: centsToDollars(request.finance?.actualSpendCents),
            notes: request.finance?.notes || "",
        });
        setBooking({
            location: request.booking?.location || "",
            bookingDate: dateValue(request.booking?.startDate) || eventDateValue(request),
            startTime: timeValue(request.booking?.startDate),
            endTime: timeValue(request.booking?.endDate),
            notes: request.booking?.notes || "",
        });
        setMeetingDecision(request.agendaOutcome?.note || "");
        setMarketingLink(request.checkpoints?.find((checkpoint) => checkpoint.key === "marketing")?.link || request.promotionalAssets?.[0] || "");
        setPurchase({ description: "", vendor: "", amount: "", purchasedAt: new Date().toISOString().slice(0, 10), receiptUrl: "" });
    }, [request]);

    const mutate = async (path, body) => {
        try {
            const data = await apiRequest(`/${request._id}${path}`, {
                method: "PATCH",
                body: JSON.stringify(body),
            });
            onUpdate(data.eventRequest);
            toast.success("Event request updated.");
        } catch (error) {
            toast.error(error.message);
        }
    };

    const reviewAction = async (action, reason) => {
        try {
            const data = await apiRequest(`/${request._id}/${action}`, {
                method: "POST",
                body: reason ? JSON.stringify({ reason }) : undefined,
            });
            onUpdate(data.eventRequest);
            toast.success(`Request ${action.replace("-", " ")}.`);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const postAction = async (path, body = {}) => {
        try {
            const data = await apiRequest(`/${request._id}${path}`, {
                method: "POST",
                body: JSON.stringify(body),
            });
            onUpdate(data.eventRequest);
            toast.success("Event request updated.");
        } catch (error) {
            toast.error(error.message);
        }
    };

    const saveMarketingLink = async (event) => {
        event.preventDefault();
        if (!marketingLink.trim()) {
            toast.error("Paste a OneDrive link first.");
            return;
        }
        try {
            const link = new URL(marketingLink.trim());
            if (link.protocol !== "https:") throw new Error("Use a secure OneDrive link.");
        } catch (error) {
            toast.error(error.message || "Enter a valid OneDrive link.");
            return;
        }
        try {
            const linkResponse = await apiRequest(`/${request._id}/checklist/marketing`, {
                method: "PATCH",
                body: JSON.stringify({ status: "in_progress", link: marketingLink.trim() }),
            });
            onUpdate(linkResponse.eventRequest);
            const completionResponse = await apiRequest(`/${request._id}/marketing-complete`, { method: "POST" });
            onUpdate(completionResponse.eventRequest);
            toast.success("Marketing approved. Request moved to Purchases.");
        } catch (error) {
            toast.error(error.message);
        }
    };

    /*
     * The PR team owns the design folder in OneDrive. Store the review link on
     * the marketing checkpoint so the source remains easy to update and audit.
     */
    const marketingLinkSaved = marketingLink.trim();
    const purchasesComplete = request.checkpoints?.some((checkpoint) => checkpoint.key === "purchases" && checkpoint.status === "completed");

    const savePurchase = async (event) => {
        event.preventDefault();
        const amountCents = dollarsToCents(purchase.amount);
        if (!purchase.description.trim() || amountCents === null || amountCents === undefined) {
            toast.error("Enter a purchase description and valid amount.");
            return;
        }
        try {
            const data = await apiRequest(`/${request._id}/purchases`, {
                method: "POST",
                body: JSON.stringify({ ...purchase, description: purchase.description.trim(), amountCents, purchasedAt: purchase.purchasedAt }),
            });
            onUpdate(data.eventRequest);
            setPurchase({ description: "", vendor: "", amount: "", purchasedAt: new Date().toISOString().slice(0, 10), receiptUrl: "" });
            toast.success("Purchase added to the event log.");
        } catch (error) {
            toast.error(error.message);
        }
    };

    const completePurchases = async () => {
        if (purchasesComplete) {
            onPurchaseComplete?.(request._id);
            return;
        }
        try {
            const data = await apiRequest(`/${request._id}/checklist/purchases`, {
                method: "PATCH",
                body: JSON.stringify({ status: "completed" }),
            });
            onUpdate(data.eventRequest);
            toast.success("Purchases posted. The review step is now open.");
            onPurchaseComplete?.(request._id);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const askForReason = (action, label) => {
        const reason = window.prompt(label);
        if (reason?.trim()) reviewAction(action, reason.trim());
    };

    const saveBudget = (event) => {
        event.preventDefault();
        const allocatedCents = dollarsToCents(budget.allocated);
        const actualSpendCents = CANONICAL_STATES.has(request.status) ? undefined : dollarsToCents(budget.actual);
        if (allocatedCents === null || (!CANONICAL_STATES.has(request.status) && actualSpendCents === null)) {
            toast.error("Budget amounts must be valid dollar values.");
            return;
        }
        if (CANONICAL_STATES.has(request.status)) {
            postAction("/finance", {
                decision: budget.decision || "approve",
                approvedAmountCents: allocatedCents,
                note: budget.notes || "",
            });
        } else {
            mutate("/budget", { allocatedCents, actualSpendCents, notes: budget.notes });
        }
    };

    const saveBooking = (event) => {
        event.preventDefault();
        const bookingDate = booking.bookingDate || eventDateValue(request);
        mutate("/booking", {
            ...(booking.location && { location: booking.location }),
            ...(booking.startTime && { startDate: `${bookingDate}T${booking.startTime}:00` }),
            ...(booking.endTime && { endDate: `${bookingDate}T${booking.endTime}:00` }),
            notes: booking.notes,
        });
    };

    const roomBookingComplete = request.checkpoints?.some((checkpoint) => checkpoint.key === "room" && checkpoint.status === "completed");
    const canRecordMeeting = can("events.meeting.manage") || can("events.operations.manage");
    const canBookRoom = (can("events.room.manage") || (request.status === "FINANCE_REVIEW" && can("events.finance.manage")))
        && (!CANONICAL_STATES.has(request.status) || request.status === "FINANCE_REVIEW");

    return (
        <aside className="event-ops-detail editorial-card" aria-label={`${request.eventName} details`}>
            {showHeading && <>
                <div className="event-ops-detail-heading">
                    <div><span className="event-ops-kicker">Request detail</span><h3>{request.eventName}</h3></div>
                    <StatusBadge status={request.status} />
                </div>
                <p className="event-ops-detail-meta">{request.requestingGroup} · {formatDate(request.eventDate || request.proposedStartDate)}</p>
                <p>{request.purpose || request.description}</p>
            </>}

            {(request.status === "submitted" || request.status === "changes_requested") && can("events.leadership.approve") ? (
                <div className="event-ops-actions">
                    <button className="cta-secondary" onClick={() => reviewAction("approve")}>Approve & publish</button>
                    <button className="cta-primary" onClick={() => askForReason("request-changes", "What should the requester change?")}>Request changes</button>
                    <button className="event-ops-danger" onClick={() => askForReason("deny", "Why is this request denied?")}>Deny</button>
                </div>
            ) : null}

            {request.status === "PVP_REVIEW" && can("events.leadership.approve") && <div className="event-ops-actions">
                <button className="cta-secondary" onClick={() => postAction("/advance")}>Advance to agenda</button>
                <button className="cta-primary" onClick={() => { const comment = window.prompt("What should the requester revise?"); if (comment?.trim()) postAction("/return", { comment: comment.trim() }); }}>Return for revision</button>
                <button className="event-ops-danger" onClick={() => { const comment = window.prompt("Why is this request rejected?"); if (comment?.trim()) postAction("/reject", { comment: comment.trim() }); }}>Reject request</button>
            </div>}

            {request.status === "AGENDA" && canRecordMeeting && <div className="event-ops-actions">
                <p className="event-ops-budget-hint">Record the meeting decision before booking a room.</p>
                <label className="form-label event-ops-full-width">Meeting decision<textarea className="form-input" rows="3" value={meetingDecision} onChange={(event) => setMeetingDecision(event.target.value)} placeholder="Summarize the board's decision" /></label>
                <button className="cta-secondary" disabled={!meetingDecision.trim()} onClick={() => postAction("/agenda-outcome", { outcome: "proceed", note: meetingDecision.trim() })}>Record proceed</button>
                <button className="cta-primary" onClick={() => { const note = window.prompt("Why is this item tabled?"); if (note?.trim()) postAction("/agenda-outcome", { outcome: "table", note: note.trim() }); }}>Table item</button>
                <button className="event-ops-danger" onClick={() => { const note = window.prompt("Why is this item declined?"); if (note?.trim()) postAction("/agenda-outcome", { outcome: "decline", note: note.trim() }); }}>Decline item</button>
            </div>}

            {request.status === "MARKETING_QUEUED" && can("events.marketing.manage") && <div className="event-ops-actions"><button className="cta-secondary" onClick={() => postAction("/marketing-complete")} disabled={!marketingLinkSaved}>Complete marketing & move to Purchases</button></div>}
            {request.status === "SCHEDULED" && can("events.publication.manage") && !request.publishedEventId && <div className="event-ops-actions"><button className="cta-secondary" onClick={() => postAction("/publish")}>Publish event</button></div>}

            <div className="event-ops-detail-grid">
            {canBookRoom && <form className="event-ops-detail-section" onSubmit={saveBooking}>
                <h4>Room booking</h4>
                <label className="form-label">Location<input className="form-input" value={booking.location || ""} onChange={(event) => setBooking({ ...booking, location: event.target.value })} /></label>
                <label className="form-label">Booking date<input className="form-input" type="date" value={booking.bookingDate || ""} onChange={(event) => setBooking({ ...booking, bookingDate: event.target.value })} /></label>
                <div className="event-ops-inline-fields">
                    <label className="form-label">Start time<input className="form-input" type="time" value={booking.startTime || ""} onChange={(event) => setBooking({ ...booking, startTime: event.target.value })} /></label>
                    <label className="form-label">End time<input className="form-input" type="time" value={booking.endTime || ""} onChange={(event) => setBooking({ ...booking, endTime: event.target.value })} /></label>
                </div>
                <label className="form-label">Booking notes<textarea className="form-input" rows="2" value={booking.notes || ""} onChange={(event) => setBooking({ ...booking, notes: event.target.value })} /></label>
                <button className="standard-button" type="submit">Save booking</button>
            </form>}

            {request.status === "MARKETING_QUEUED" && can("events.marketing.manage") && <form className="event-ops-detail-section event-ops-marketing-review" onSubmit={saveMarketingLink}>
                <h4>Marketing designs</h4>
                <p className="event-ops-budget-hint">Paste the OneDrive folder or file link containing the final designs for PR review.</p>
                <label className="form-label">OneDrive marketing link<input className="form-input" type="url" value={marketingLink} onChange={(event) => setMarketingLink(event.target.value)} placeholder="https://1drv.ms/..." required /></label>
                {marketingLinkSaved && <p><a href={marketingLinkSaved} target="_blank" rel="noreferrer">Open marketing designs in OneDrive</a></p>}
                <button className="standard-button" type="submit">Save link & move to Purchases</button>
            </form>}

            {request.status === "SCHEDULED" && (can("events.purchases.complete") || can("events.requests.edit")) && <form className="event-ops-detail-section event-ops-purchases" onSubmit={savePurchase}>
                <h4>Event purchases</h4>
                <p className="event-ops-budget-hint">Log each purchase made for this event. The total updates from the itemized entries.</p>
                {request.purchases?.length > 0 && <div className="event-ops-purchase-list">
                    {request.purchases.map((item) => <div className="event-ops-purchase-row" key={item._id || `${item.description}-${item.purchasedAt}`}><div><strong>{item.description}</strong><span>{item.vendor || "Vendor not listed"} · {formatDate(item.purchasedAt)}</span></div><strong>${(item.amountCents / 100).toFixed(2)}</strong></div>)}
                    <div className="event-ops-purchase-total"><span>Total purchases</span><strong>${(request.purchases.reduce((total, item) => total + item.amountCents, 0) / 100).toFixed(2)}</strong></div>
                </div>}
                <div className="event-ops-inline-fields">
                    <label className="form-label">Description<input className="form-input" value={purchase.description} onChange={(event) => setPurchase({ ...purchase, description: event.target.value })} required /></label>
                    <label className="form-label">Amount ($)<input className="form-input" inputMode="decimal" value={purchase.amount} onChange={(event) => setPurchase({ ...purchase, amount: event.target.value })} required /></label>
                </div>
                <div className="event-ops-inline-fields">
                    <label className="form-label">Vendor<input className="form-input" value={purchase.vendor} onChange={(event) => setPurchase({ ...purchase, vendor: event.target.value })} /></label>
                    <label className="form-label">Purchase date<input className="form-input" type="date" value={purchase.purchasedAt} onChange={(event) => setPurchase({ ...purchase, purchasedAt: event.target.value })} required /></label>
                </div>
                <label className="form-label">Receipt link (optional)<input className="form-input" type="url" value={purchase.receiptUrl} onChange={(event) => setPurchase({ ...purchase, receiptUrl: event.target.value })} placeholder="https://..." /></label>
                <button className="standard-button" type="submit">Add purchase</button>
                <button className="cta-secondary" type="button" disabled={!purchasesComplete && !request.purchases?.length} onClick={completePurchases}>Post purchases</button>
            </form>}

            {can("events.finance.manage") && (request.status === "FINANCE_REVIEW" || !CANONICAL_STATES.has(request.status)) && <form className="event-ops-detail-section" onSubmit={saveBudget}>
                <h4>Finance</h4>
                {request.status === "FINANCE_REVIEW" && <p className="event-ops-budget-hint">Initial request: ${centsToDollars(request.fundingRequestedCents) || "0.00"}. Adjust only if needed.</p>}
                <div className="event-ops-inline-fields">
                    <label className="form-label">{request.status === "FINANCE_REVIEW" ? "Approved amount ($)" : "Allocated ($)"}<input className="form-input" inputMode="decimal" value={budget.allocated || ""} onChange={(event) => setBudget({ ...budget, allocated: event.target.value })} /></label>
                    {request.status !== "FINANCE_REVIEW" && <label className="form-label">Actual spend ($)<input className="form-input" inputMode="decimal" value={budget.actual || ""} onChange={(event) => setBudget({ ...budget, actual: event.target.value })} /></label>}
                </div>
                <label className="form-label">Finance notes<textarea className="form-input" rows="2" value={budget.notes || ""} onChange={(event) => setBudget({ ...budget, notes: event.target.value })} /></label>
                {request.status === "FINANCE_REVIEW" && <label className="form-label">Decision<select className="form-input" value={budget.decision || "approve"} onChange={(event) => setBudget({ ...budget, decision: event.target.value })}><option value="approve">Approve as requested</option><option value="approve_partial">Approve different amount</option><option value="deny">Deny funding</option></select></label>}
                {request.status === "FINANCE_REVIEW" && !roomBookingComplete && <p className="event-ops-budget-hint">Complete room booking before recording the funding decision.</p>}
                <button className="standard-button" type="submit" disabled={request.status === "FINANCE_REVIEW" && !roomBookingComplete}>{request.status === "FINANCE_REVIEW" ? "Record funding decision" : "Save finance"}</button>
            </form>}

            {showHistory && <DecisionHistory entries={request.auditEntries} />}
            </div>
        </aside>
    );
}

export default EventDetail;
