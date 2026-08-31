import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

const API_PATH = "/api/v1/event-requests";
const CHECKPOINTS = [
    ["proposal", "Proposal"],
    ["meeting", "Meeting"],
    ["room", "Room"],
    ["finance", "Finance"],
    ["marketing", "Marketing"],
    ["purchases", "Purchases"],
    ["review", "Review"],
];
const CANONICAL_STATES = new Set(["DRAFT", "PVP_REVIEW", "AGENDA", "FINANCE_REVIEW", "MARKETING_QUEUED", "SCHEDULED", "AWAITING_REVIEW", "REVIEWED", "REJECTED", "ARCHIVED"]);
const emptyForm = {
    title: "",
    requestingGroup: "",
    eventDate: "",
    eventTime: "",
    location: "",
    purpose: "",
    estimatedAttendance: "",
    fundingRequested: "",
    marketingNotes: "",
};

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_PATH}${path}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...options,
    });
    const data = await response.json();
    if (!response.ok || data.status === "error") {
        throw new Error(data.message || "The request could not be completed.");
    }
    return data;
}

function currentStage(request) {
    return request.checkpoints?.find((checkpoint) => checkpoint.status !== "completed")?.key || "complete";
}

function quarterOf(date) {
    return `Q${Math.floor(date.getMonth() / 3) + 1}`;
}

function weekOfQuarter(date) {
    const quarterStart = new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
    return Math.ceil((date - quarterStart + 1) / (7 * 24 * 60 * 60 * 1000));
}

function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function timeValue(value) {
    return value ? new Date(value).toISOString().slice(11, 16) : "";
}

function dateValue(value) {
    return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function eventDateValue(request) {
    return request.eventDate || new Date(request.proposedStartDate).toISOString().slice(0, 10);
}

function dollarsToCents(value) {
    if (value === "") return undefined;
    const amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

function centsToDollars(value) {
    return value === undefined || value === null ? "" : (value / 100).toFixed(2);
}

function StatusBadge({ status }) {
    const label = String(status || "unknown").replace(/_/g, " ");
    return <span className={`event-ops-status event-ops-status-${status || "unknown"}`}>{label}</span>;
}

function EventRequestForm({ onCreated, onCancel, activeCycle }) {
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    const update = (event) => setForm({ ...form, [event.target.name]: event.target.value });

    const submit = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const amount = Number(form.fundingRequested);
            const saveAsDraft = event.nativeEvent.submitter?.value === "draft";
            const payload = {
                ...form,
                estimatedAttendance: Number(form.estimatedAttendance),
                fundingRequestedCents: Number.isFinite(amount) ? Math.round(amount * 100) : null,
            };
            if (saveAsDraft) payload.saveAsDraft = true;
            delete payload.fundingRequested;
            const data = await apiRequest("/", {
                method: "POST",
                body: JSON.stringify(payload),
            });
            onCreated(data.eventRequest);
            setForm(emptyForm);
            toast.success(saveAsDraft ? "Event request draft saved." : "Event request submitted.");
        } catch (error) {
            toast.error(error.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <form className="event-ops-form editorial-card" onSubmit={submit}>
            <div className="event-ops-form-heading">
                <div>
                    <span className="event-ops-kicker">New request</span>
                    <h3>Plan an IUGA event</h3>
                </div>
                <button type="button" className="event-ops-close" onClick={onCancel}>Close</button>
            </div>
            <div className="event-ops-form-grid">
                <label className="form-label">Event title<input className="form-input" name="title" value={form.title} onChange={update} required maxLength="120" /></label>
                <label className="form-label">Requesting group<input className="form-input" name="requestingGroup" value={form.requestingGroup} onChange={update} required maxLength="120" /></label>
                <label className="form-label">Event date<input className="form-input" type="date" name="eventDate" value={form.eventDate} onChange={update} required /></label>
                <label className="form-label">Event time<input className="form-input" type="time" name="eventTime" value={form.eventTime} onChange={update} required /></label>
                <label className="form-label">Location<input className="form-input" name="location" value={form.location} onChange={update} required maxLength="500" /></label>
                <label className="form-label">Estimated attendance<input className="form-input" type="number" min="0" name="estimatedAttendance" value={form.estimatedAttendance} onChange={update} required /></label>
                <label className="form-label">Funding request ($)<input className="form-input" type="number" min="0" step="0.01" name="fundingRequested" value={form.fundingRequested} onChange={update} required /></label>
                {activeCycle && <p className="event-ops-budget-hint">Remaining academic-year budget: ${(Math.max(0, (activeCycle.budgetTotalCents || 0) - (activeCycle.budgetCommittedCents || 0)) / 100).toFixed(2)}</p>}
                <label className="form-label event-ops-full-width">Event purpose<textarea className="form-input" name="purpose" value={form.purpose} onChange={update} required maxLength="2000" rows="4" /></label>
                <label className="form-label event-ops-full-width">Marketing notes<textarea className="form-input" name="marketingNotes" value={form.marketingNotes} onChange={update} maxLength="2000" rows="3" /></label>
            </div>
            <div className="event-ops-form-actions">
                <button type="submit" name="action" value="submit" className="cta-secondary" disabled={saving}>{saving ? "Submitting…" : "Submit request"}</button>
                <button type="submit" name="action" value="draft" className="cta-primary" disabled={saving}>Save draft</button>
                <button type="button" className="cta-primary" onClick={onCancel}>Cancel</button>
            </div>
        </form>
    );
}

function EventDetail({ request, onUpdate, can, onPurchaseComplete }) {
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
            toast.success("Purchases complete. Opening post-event review.");
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
            <div className="event-ops-detail-heading">
                <div><span className="event-ops-kicker">Request detail</span><h3>{request.eventName}</h3></div>
                <StatusBadge status={request.status} />
            </div>
            <p className="event-ops-detail-meta">{request.requestingGroup} · {formatDate(request.eventDate || request.proposedStartDate)}</p>
            <p>{request.purpose || request.description}</p>

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
                <button className="cta-secondary" type="button" disabled={!purchasesComplete && !request.purchases?.length} onClick={completePurchases}>Proceed to post-event review</button>
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

            {request.auditEntries?.length > 0 && <section className="event-ops-detail-section" aria-labelledby="event-audit-heading">
                <h4 id="event-audit-heading">Decision history</h4>
                <ol className="event-ops-audit-list">
                    {request.auditEntries.map((entry) => <li key={entry._id || `${entry.action}-${entry.createdAt}`}><strong>{String(entry.action).replace(/_/g, " ")}</strong><span>{formatDate(entry.createdAt)}</span>{entry.comment && <p>{entry.comment}</p>}</li>)}
                </ol>
            </section>}
            </div>
        </aside>
    );
}

function EventOperations({ isAdmin = false, can: canPermission, activeCycle, onPurchaseComplete }) {
    const can = canPermission || (() => isAdmin);
    const canView = can("events.requests.view");
    const canCreate = can("events.requests.create");
    const [requests, setRequests] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [ledger, setLedger] = useState([]);
    const [filters, setFilters] = useState({ year: "", quarter: "", week: "", stage: "", requester: "", search: "" });
    const [error, setError] = useState("");
    const [cycleBudget, setCycleBudget] = useState(activeCycle);

    useEffect(() => setCycleBudget(activeCycle), [activeCycle]);

    useEffect(() => {
        if (!canView) return;
        apiRequest("")
            .then((data) => setRequests(data.eventRequests || []))
            .catch((requestError) => setError(requestError.message));
    }, [canView]);

    useEffect(() => {
        if (!cycleBudget?._id || !can("events.finance.manage")) return;
        fetch(`/api/v1/cycles/${cycleBudget._id}/ledger`, { credentials: "include" })
            .then((response) => response.json())
            .then((data) => setLedger(data.entries || []))
            .catch((requestError) => setError(requestError.message));
    }, [cycleBudget?._id, can]);

    const years = useMemo(() => [...new Set(requests.map((request) => new Date(request.proposedStartDate).getFullYear()))].sort(), [requests]);
    const requesters = useMemo(() => [...new Set(requests.map((request) => request.requestingGroup).filter(Boolean))].sort(), [requests]);
    const filteredRequests = useMemo(() => requests.filter((request) => {
        const date = new Date(request.proposedStartDate);
        const stage = currentStage(request);
        return (!filters.year || date.getFullYear().toString() === filters.year)
            && (!filters.quarter || quarterOf(date) === filters.quarter)
            && (!filters.week || weekOfQuarter(date).toString() === filters.week)
            && (!filters.stage || stage === filters.stage)
            && (!filters.requester || request.requestingGroup === filters.requester)
            && (!filters.search || `${request.eventName} ${request.requestingGroup}`.toLowerCase().includes(filters.search.toLowerCase()));
    }), [filters, requests]);
    const selected = requests.find((request) => request._id === selectedId) || null;

    const selectRequest = async (request) => {
        setSelectedId(request._id);
        try {
            const data = await apiRequest(`/${request._id}`);
            setRequests((current) => current.map((item) => item._id === request._id ? data.eventRequest : item));
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    const updateRequest = (updated) => setRequests((current) => current.map((request) => request._id === updated._id ? updated : request));
    const addRequest = (created) => {
        setRequests((current) => current.some((request) => request._id === created._id)
            ? current.map((request) => request._id === created._id ? created : request)
            : [...current, created]);
        setSelectedId(created._id);
        setShowForm(false);
    };

    if (!canView) return null;

    return (
        <section className="event-operations" aria-labelledby="event-operations-heading">
            <div className="event-ops-header">
                <div><span className="event-ops-kicker">Officer workspace</span><h2 id="event-operations-heading">Event operations</h2><p>Track requests from proposal through post-event review.</p></div>
                {canCreate && <button className="cta-secondary" onClick={() => setShowForm(!showForm)}>{showForm ? "Hide form" : "New event request"}</button>}
            </div>
            {showForm && canCreate && <EventRequestForm onCreated={addRequest} onCancel={() => setShowForm(false)} activeCycle={cycleBudget} />}
            <div className="event-ops-filters" role="group" aria-label="Event request filters">
                <label>Year<select value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })}><option value="">All years</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
                <label>Quarter<select value={filters.quarter} onChange={(event) => setFilters({ ...filters, quarter: event.target.value })}><option value="">All quarters</option>{["Q1", "Q2", "Q3", "Q4"].map((quarter) => <option key={quarter}>{quarter}</option>)}</select></label>
                <label>Week<select value={filters.week} onChange={(event) => setFilters({ ...filters, week: event.target.value })}><option value="">All weeks</option>{Array.from({ length: 14 }, (_, index) => <option key={index + 1}>{index + 1}</option>)}</select></label>
                <label>Current stage<select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}><option value="">All stages</option>{CHECKPOINTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="complete">Complete</option></select></label>
                <label>Group<select value={filters.requester} onChange={(event) => setFilters({ ...filters, requester: event.target.value })}><option value="">All groups</option>{requesters.map((requester) => <option key={requester}>{requester}</option>)}</select></label>
                <label className="event-ops-search">Search<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Event or group" /></label>
            </div>
            {error && <p className="event-ops-error" role="alert">{error}</p>}
            {cycleBudget && can("events.finance.manage") && <section className="event-ops-ledger editorial-card" aria-labelledby="budget-ledger-heading">
                <div><span className="event-ops-kicker">{cycleBudget.cycleName || "Academic year"}</span><h3 id="budget-ledger-heading">Budget ledger</h3><p>Remaining: ${Math.max(0, (cycleBudget.budgetTotalCents || 0) - (cycleBudget.budgetCommittedCents || 0)) / 100}</p></div>
                {ledger.length > 0 && <table className="event-ops-table"><caption className="sr-only">Academic-year funding commitments</caption><thead><tr><th scope="col">Request</th><th scope="col">Amount</th><th scope="col">Decision date</th></tr></thead><tbody>{ledger.map((entry) => <tr key={entry._id}><th scope="row">{entry.eventRequestId?.title || entry.eventRequestId?.eventName || "Event request"}</th><td>${(entry.amountCents / 100).toFixed(2)}</td><td>{formatDate(entry.decidedAt)}</td></tr>)}</tbody></table>}
            </section>}
            <div className={`event-ops-layout${selected ? "" : " event-ops-layout-full"}`}>
                <div className="event-ops-table-wrapper">
                    <table className="event-ops-table">
                        <caption className="sr-only">Event requests and checkpoint status</caption>
                        <thead><tr><th scope="col">Event</th>{CHECKPOINTS.map(([, label]) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
                        <tbody>
                            {filteredRequests.map((request) => {
                                const stage = currentStage(request);
                                return <tr key={request._id} className={selectedId === request._id ? "event-ops-row-selected" : ""}>
                                    <th scope="row"><button className="event-ops-event-button" aria-pressed={selectedId === request._id} onClick={() => selectRequest(request)}><strong>{request.eventName}</strong><span>{formatDate(request.proposedStartDate)}</span><StatusBadge status={request.status} /></button></th>
                                    {CHECKPOINTS.map(([key, label]) => {
                                        const checkpoint = request.checkpoints?.find((item) => item.key === key) || { status: "pending" };
                                        return <td key={key} className={stage === key ? "event-ops-current" : ""} data-label={label}><span className="event-ops-mobile-label">{label}</span><StatusBadge status={checkpoint.status} /></td>;
                                    })}
                                </tr>;
                            })}
                        </tbody>
                    </table>
                    {!filteredRequests.length && <p className="event-ops-empty">No event requests match these filters.</p>}
                </div>
                {selected && <EventDetail request={selected} onUpdate={updateRequest} can={can} onPurchaseComplete={onPurchaseComplete} />}
            </div>
        </section>
    );
}

export default EventOperations;
