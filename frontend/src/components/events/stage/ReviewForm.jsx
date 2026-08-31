import { useState } from "react";
import { toast } from "react-toastify";
import { apiRequest } from "../../../utils/eventRequest";

/*
 * Post-event review capture. Available once the event date has passed; submits
 * to POST /event-requests/:id/reviews and hands the refreshed request back.
 */
function ReviewForm({ request, onSubmitted }) {
    const [form, setForm] = useState({ pros: "", cons: "", actualAttendance: "", repeatRecommendation: "with_changes" });

    const eventDate = new Date(request.eventDate || request.proposedStartDate);
    const reviewOpen = eventDate <= new Date();

    if (!reviewOpen) {
        return (
            <section className="event-ops-detail-section">
                <h4>Review opens after the event</h4>
                <p>This event is scheduled for {eventDate.toLocaleString()}. Return here after the event to submit the review.</p>
            </section>
        );
    }

    const submit = async (event) => {
        event.preventDefault();
        try {
            const data = await apiRequest(`/${request._id}/reviews`, {
                method: "POST",
                body: JSON.stringify({ ...form, actualAttendance: Number(form.actualAttendance) }),
            });
            toast.success("Post-event review submitted.");
            onSubmitted?.(data.eventRequest);
        } catch (submitError) {
            toast.error(submitError.message);
        }
    };

    return (
        <form className="event-ops-detail-section" onSubmit={submit}>
            <h4>Post-event review</h4>
            <p className="event-ops-budget-hint">Estimated attendance: {request.estimatedAttendance ?? "—"}</p>
            <label className="form-label">What went well<textarea className="form-input" rows="4" value={form.pros} onChange={(event) => setForm({ ...form, pros: event.target.value })} required /></label>
            <label className="form-label">What should improve<textarea className="form-input" rows="4" value={form.cons} onChange={(event) => setForm({ ...form, cons: event.target.value })} required /></label>
            <label className="form-label">Actual attendance<input className="form-input" type="number" min="0" value={form.actualAttendance} onChange={(event) => setForm({ ...form, actualAttendance: event.target.value })} required /></label>
            <label className="form-label">Repeat recommendation<select className="form-input" value={form.repeatRecommendation} onChange={(event) => setForm({ ...form, repeatRecommendation: event.target.value })}><option value="yes">Yes</option><option value="no">No</option><option value="with_changes">With changes</option></select></label>
            <button className="cta-secondary" type="submit">Submit post-event review</button>
        </form>
    );
}

export default ReviewForm;
