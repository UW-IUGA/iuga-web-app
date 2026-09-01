import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import AdminRoute from "../components/AdminRoute";
import StatusBadge from "../components/events/StatusBadge";
import RequestStepper from "../components/events/RequestStepper";
import EventDetail from "../components/events/EventDetail";
import EventRecord from "../components/events/EventRecord";
import DecisionHistory from "../components/events/DecisionHistory";
import ReviewForm from "../components/events/stage/ReviewForm";
import { useAuthContext } from "../context/AuthContext";
import { apiRequest, canonicalState, formatDate } from "../utils/eventRequest";

function AdminRequest() {
    const { id } = useParams();
    const { can } = useAuthContext();
    const [request, setRequest] = useState(null);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            const data = await apiRequest(`/${id}`);
            setRequest(data.eventRequest);
        } catch (requestError) {
            setError(requestError.message);
        }
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const applyUpdate = (updated) => setRequest((current) => ({ ...updated, auditEntries: updated.auditEntries || current?.auditEntries }));

    // The post-event review belongs only to the Review step; every earlier stage
    // renders its own forms through EventDetail.
    const inReview = request && canonicalState(request.status) === "AWAITING_REVIEW";

    return (
        <AdminRoute requiredPermission="events.requests.view">
            <main className="baseContainer adminPage adminRequestPage">
                <Link className="adminBackLink" to="/admin/pipeline">← Back to pipeline</Link>
                {error && <p className="event-ops-error" role="alert">{error}</p>}
                {request && <>
                    <header className="adminPageHeader adminRequestHeader">
                        <div>
                            <span className="event-ops-kicker">Event pipeline</span>
                            <h1>{request.eventName}</h1>
                            <p>{request.requestingGroup} · {formatDate(request.eventDate || request.proposedStartDate)}</p>
                        </div>
                        <StatusBadge status={request.status} />
                    </header>

                    <RequestStepper request={request} />

                    {inReview
                        ? (can("events.review.manage") && <section className="adminRequestReview editorial-card">
                            <ReviewForm request={request} onSubmitted={(updated) => (updated ? applyUpdate(updated) : load())} />
                        </section>)
                        : <EventDetail request={request} onUpdate={applyUpdate} can={can} onPurchaseComplete={load} showHeading={false} showHistory={false} />}

                    <details className="adminRequestPanel">
                        <summary>Event record</summary>
                        <EventRecord record={{ eventRequest: request }} />
                    </details>

                    <details className="adminRequestPanel">
                        <summary>Decision history</summary>
                        <DecisionHistory entries={request.auditEntries} showHeading={false} />
                    </details>
                </>}
            </main>
        </AdminRoute>
    );
}

export default AdminRequest;
