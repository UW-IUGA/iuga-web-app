import { useEffect, useMemo, useState } from "react";
import StatusBadge from "./events/StatusBadge";
import EventRequestForm from "./events/EventRequestForm";
import EventDetail from "./events/EventDetail";
import {
    apiRequest,
    CHECKPOINTS,
    currentStage,
    formatDate,
    quarterOf,
    weekOfQuarter,
} from "../utils/eventRequest";

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
