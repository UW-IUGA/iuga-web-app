import { useState } from "react";
import { toast } from "react-toastify";
import { apiRequest } from "../../utils/eventRequest";

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

export default EventRequestForm;
