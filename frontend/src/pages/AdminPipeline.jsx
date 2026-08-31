import { useEffect, useMemo, useState } from "react";
import AdminRoute from "../components/AdminRoute";
import EventRequestForm from "../components/events/EventRequestForm";
import PipelineCard from "../components/events/PipelineCard";
import { useAuthContext } from "../context/AuthContext";
import { apiRequest, canonicalState, DONE_STATES, formatDate, PIPELINE_COLUMNS } from "../utils/eventRequest";

function AdminPipeline() {
    const { can, activeCycle } = useAuthContext();
    const canCreate = can("events.requests.create");
    const [requests, setRequests] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [showDone, setShowDone] = useState(false);
    const [filters, setFilters] = useState({ year: "", group: "", search: "" });
    const [ledger, setLedger] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        apiRequest("")
            .then((data) => setRequests(data.eventRequests || []))
            .catch((requestError) => setError(requestError.message));
    }, []);

    useEffect(() => {
        if (!activeCycle?._id || !can("events.finance.manage")) return;
        fetch(`/api/v1/cycles/${activeCycle._id}/ledger`, { credentials: "include" })
            .then((response) => response.json())
            .then((data) => setLedger(data.entries || []))
            .catch((requestError) => setError(requestError.message));
    }, [activeCycle?._id, can]);

    const years = useMemo(() => [...new Set(requests.map((request) => new Date(request.proposedStartDate).getFullYear()))].sort(), [requests]);
    const groups = useMemo(() => [...new Set(requests.map((request) => request.requestingGroup).filter(Boolean))].sort(), [requests]);

    const filtered = useMemo(() => requests.filter((request) => {
        const year = new Date(request.proposedStartDate).getFullYear().toString();
        return (!filters.year || year === filters.year)
            && (!filters.group || request.requestingGroup === filters.group)
            && (!filters.search || `${request.eventName} ${request.requestingGroup}`.toLowerCase().includes(filters.search.toLowerCase()));
    }), [filters, requests]);

    const byState = (state) => filtered.filter((request) => canonicalState(request.status) === state);
    const doneRequests = filtered.filter((request) => DONE_STATES.has(canonicalState(request.status)));

    const updateRequest = (updated) => setRequests((current) => current.map((request) => request._id === updated._id ? { ...request, ...updated } : request));
    const addRequest = (created) => {
        setRequests((current) => [...current, created]);
        setShowForm(false);
    };

    return (
        <AdminRoute requiredPermission="events.requests.view">
            <main className="baseContainer adminPage adminPipelinePage">
                <header className="adminPageHeader adminPipelineHeader">
                    <div>
                        <span className="event-ops-kicker">Exec board workspace</span>
                        <h1>Pipeline</h1>
                        <p>Every event request by stage. Your column is highlighted; act on a card or open it for the full record.</p>
                    </div>
                    {canCreate && <button className="cta-secondary" type="button" onClick={() => setShowForm((visible) => !visible)}>{showForm ? "Close form" : "+ New request"}</button>}
                </header>

                {error && <p className="event-ops-error" role="alert">{error}</p>}
                {showForm && canCreate && <EventRequestForm onCreated={addRequest} onCancel={() => setShowForm(false)} activeCycle={activeCycle} />}

                <div className="adminPipelineFilters" role="group" aria-label="Pipeline filters">
                    <label>Academic year<select value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })}><option value="">All years</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
                    <label>Group<select value={filters.group} onChange={(event) => setFilters({ ...filters, group: event.target.value })}><option value="">All groups</option>{groups.map((group) => <option key={group}>{group}</option>)}</select></label>
                    <label className="adminPipelineFilters__search">Search<input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Event or group" /></label>
                </div>

                {activeCycle && can("events.finance.manage") && <section className="event-ops-ledger editorial-card" aria-labelledby="budget-ledger-heading">
                    <div><span className="event-ops-kicker">{activeCycle.cycleName || "Academic year"}</span><h2 id="budget-ledger-heading">Budget ledger</h2><p>Remaining: ${Math.max(0, (activeCycle.budgetTotalCents || 0) - (activeCycle.budgetCommittedCents || 0)) / 100}</p></div>
                    {ledger.length > 0 && <table className="event-ops-table"><caption className="sr-only">Academic-year funding commitments</caption><thead><tr><th scope="col">Request</th><th scope="col">Amount</th><th scope="col">Decision date</th></tr></thead><tbody>{ledger.map((entry) => <tr key={entry._id}><th scope="row">{entry.eventRequestId?.title || entry.eventRequestId?.eventName || "Event request"}</th><td>${(entry.amountCents / 100).toFixed(2)}</td><td>{formatDate(entry.decidedAt)}</td></tr>)}</tbody></table>}
                </section>}

                <div className="adminPipelineBoard">
                    {PIPELINE_COLUMNS.map(([state, label]) => {
                        const column = byState(state);
                        return (
                            <section className="adminPipelineColumn" key={state} aria-label={label}>
                                <header className="adminPipelineColumn__header">
                                    <h2>{label}</h2>
                                    <span>{column.length}</span>
                                </header>
                                {column.length > 0
                                    ? column.map((request) => <PipelineCard key={request._id} request={request} can={can} onUpdated={updateRequest} />)
                                    : <p className="adminPipelineColumn__empty">Nothing here.</p>}
                            </section>
                        );
                    })}
                </div>

                {doneRequests.length > 0 && <section className="adminPipelineDone">
                    <button className="text-button" type="button" onClick={() => setShowDone((visible) => !visible)}>
                        {showDone ? "Hide" : "Show"} done &amp; archived ({doneRequests.length})
                    </button>
                    {showDone && <div className="adminPipelineDone__list">
                        {doneRequests.map((request) => <PipelineCard key={request._id} request={request} can={can} onUpdated={updateRequest} />)}
                    </div>}
                </section>}
            </main>
        </AdminRoute>
    );
}

export default AdminPipeline;
