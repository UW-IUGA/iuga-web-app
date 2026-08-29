import { useEffect, useState } from "react";
import AdminRoute from "../components/AdminRoute";
import { useAuthContext } from "../context/AuthContext";
import { adminRequest } from "../utils/adminApi";

function AdminJournal() {
    const { can, user } = useAuthContext();
    const [entries, setEntries] = useState([]);
    const emptyForm = () => ({ entryDate: new Date().toISOString().slice(0, 10), body: "", tags: "" });
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState(null);
    const [error, setError] = useState("");

    const loadEntries = async () => {
        try {
            const { entries: loaded } = await adminRequest("journal");
            setEntries(loaded || []);
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    useEffect(() => {
        loadEntries();
    }, []);

    const isOwnEntry = (entry) => String(entry.authorId?._id || entry.authorId) === String(user?._id);

    const beginEdit = (entry) => {
        setEditingId(entry._id);
        setForm({
            entryDate: new Date(entry.entryDate).toISOString().slice(0, 10),
            body: entry.body,
            tags: (entry.tags || []).join(", "),
        });
        setError("");
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(emptyForm());
    };

    const submitEntry = async (event) => {
        event.preventDefault();
        try {
            const { entry } = await adminRequest(editingId ? `journal/${editingId}` : "journal", {
                method: editingId ? "PATCH" : "POST",
                body: JSON.stringify({ ...form, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }),
            });
            setEntries((current) => editingId
                ? current.map((currentEntry) => currentEntry._id === entry._id ? entry : currentEntry)
                : [entry, ...current]);
            cancelEdit();
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    return (
        <AdminRoute requiredPermission="journal.read">
            <main className="baseContainer adminPage">
                <header className="adminPageHeader">
                    <span className="event-ops-kicker">Institutional memory</span>
                    <h1>Advocacy journal</h1>
                    <p>Record themes from student conversations without recording student names or identifying details.</p>
                </header>
                {error && <p className="event-ops-error" role="alert">{error}</p>}
                {can("journal.create") && <form className="adminMemoryCard editorial-card adminMemoryForm" onSubmit={submitEntry}>
                    <h2>{editingId ? "Edit journal entry" : "New journal entry"}</h2>
                    <p className="adminMemoryGuidance">Do not include student names, NetIDs, or other identifying details.</p>
                    <label className="form-label">Date<input className="form-input" type="date" value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} required /></label>
                    <label className="form-label">What did you hear?<textarea className="form-input" rows="6" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} required /></label>
                    <label className="form-label">Topic tags<input className="form-input" value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="curriculum, advising" /></label>
                    <div className="adminMemoryFormActions">
                        <button className="standard-button" type="submit">{editingId ? "Update journal entry" : "Save journal entry"}</button>
                        {editingId && <button className="cta-secondary" type="button" onClick={cancelEdit}>Cancel edit</button>}
                    </div>
                </form>}
                <section className="adminMemoryList" aria-label="Journal entries">
                    {entries.length ? entries.map((entry) => <article className="adminMemoryCard editorial-card" key={entry._id}><span className="event-ops-kicker">{new Date(entry.entryDate).toLocaleDateString()}</span><p>{entry.body}</p><small>{entry.tags?.join(" · ")}</small>{isOwnEntry(entry) && can("journal.edit_own") && <div className="adminMemoryOwner"><span>Your entry</span><button className="text-button" type="button" onClick={() => beginEdit(entry)}>Edit</button></div>}</article>) : <p className="adminMemoryEmpty">No journal entries yet.</p>}
                </section>
            </main>
        </AdminRoute>
    );
}

export default AdminJournal;
