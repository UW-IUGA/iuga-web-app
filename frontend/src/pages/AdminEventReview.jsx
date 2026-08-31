import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "react-toastify";
import AdminRoute from "../components/AdminRoute";

function AdminEventReview() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [request, setRequest] = useState(null);
    const [form, setForm] = useState({ pros: "", cons: "", actualAttendance: "", repeatRecommendation: "with_changes" });
    const [error, setError] = useState("");

    useEffect(() => {
        fetch(`/api/v1/event-requests/${id}`, { credentials: "include" })
            .then(async (response) => {
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || "The event request could not be loaded.");
                setRequest(data.eventRequest);
            })
            .catch((requestError) => setError(requestError.message));
    }, [id]);

    const submit = async (event) => {
        event.preventDefault();
        try {
            const response = await fetch(`/api/v1/event-requests/${id}/reviews`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, actualAttendance: Number(form.actualAttendance) }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "The review could not be submitted.");
            toast.success("Post-event review submitted.");
            navigate("/admin/events");
        } catch (submitError) {
            toast.error(submitError.message);
        }
    };

    const eventDate = request && new Date(request.eventDate || request.proposedStartDate);
    const reviewOpen = eventDate && eventDate <= new Date();

    return (
        <AdminRoute requiredPermission="events.review.manage">
            <main className="baseContainer adminPage">
                <Link className="adminBackLink" to="/admin/events">← Back to events</Link>
                <header className="adminPageHeader"><span className="event-ops-kicker">Post-event review</span><h1>{request?.eventName || "Event review"}</h1><p>Capture what happened and preserve the event outcome for future planning.</p></header>
                {error && <p className="event-ops-error" role="alert">{error}</p>}
                {request && !reviewOpen && <section className="adminAccessCard editorial-card"><h2>Review opens after the event</h2><p>This event is scheduled for {eventDate.toLocaleString()}. Return here after the event to submit the review.</p></section>}
                {request && reviewOpen && <form className="event-ops-form editorial-card" onSubmit={submit}>
                    <p>Estimated attendance: {request.estimatedAttendance ?? "—"}</p>
                    <label className="form-label">What went well<textarea className="form-input" rows="4" value={form.pros} onChange={(event) => setForm({ ...form, pros: event.target.value })} required /></label>
                    <label className="form-label">What should improve<textarea className="form-input" rows="4" value={form.cons} onChange={(event) => setForm({ ...form, cons: event.target.value })} required /></label>
                    <label className="form-label">Actual attendance<input className="form-input" type="number" min="0" value={form.actualAttendance} onChange={(event) => setForm({ ...form, actualAttendance: event.target.value })} required /></label>
                    <label className="form-label">Repeat recommendation<select className="form-input" value={form.repeatRecommendation} onChange={(event) => setForm({ ...form, repeatRecommendation: event.target.value })}><option value="yes">Yes</option><option value="no">No</option><option value="with_changes">With changes</option></select></label>
                    <button className="cta-secondary" type="submit">Submit post-event review</button>
                </form>}
            </main>
        </AdminRoute>
    );
}

export default AdminEventReview;
