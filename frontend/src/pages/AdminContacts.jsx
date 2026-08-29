import { useEffect, useState } from "react";
import AdminRoute from "../components/AdminRoute";
import { useAuthContext } from "../context/AuthContext";
import { adminRequest } from "../utils/adminApi";

function AdminContacts() {
    const { can } = useAuthContext();
    const [contacts, setContacts] = useState([]);
    const [search, setSearch] = useState("");
    const [form, setForm] = useState({ name: "", organization: "", role: "", contactMethod: "", notes: "", engagementTypes: "" });
    const [error, setError] = useState("");

    const loadContacts = async () => {
        try {
            const { contacts: loaded } = await adminRequest(`contacts${search ? `?search=${encodeURIComponent(search)}` : ""}`);
            setContacts(loaded || []);
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    useEffect(() => {
        loadContacts();
    }, [search]);

    const createContact = async (event) => {
        event.preventDefault();
        try {
            const { contact } = await adminRequest("contacts", { method: "POST", body: JSON.stringify({ ...form, engagementTypes: form.engagementTypes.split(",").map((type) => type.trim()).filter(Boolean), eventIds: [] }) });
            setContacts((current) => [contact, ...current]);
            setForm({ name: "", organization: "", role: "", contactMethod: "", notes: "", engagementTypes: "" });
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    return (
        <AdminRoute requiredPermission="contacts.read">
            <main className="baseContainer adminPage">
                <header className="adminPageHeader">
                    <span className="event-ops-kicker">Institutional memory</span>
                    <h1>Contact network</h1>
                    <p>Keep alumni and industry relationships available across board cycles.</p>
                </header>
                {error && <p className="event-ops-error" role="alert">{error}</p>}
                <label className="form-label adminSearchLabel">Search contacts<input className="form-input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, organization, or notes" /></label>
                {can("contacts.manage") && <form className="adminMemoryCard editorial-card adminMemoryForm" onSubmit={createContact}>
                    <h2>Add contact</h2>
                    {[["name", "Name"], ["organization", "Organization"], ["role", "Role"], ["contactMethod", "Contact method"], ["engagementTypes", "Engagement types"]].map(([key, label]) => <label className="form-label" key={key}>{label}<input className="form-input" value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} required={key !== "role" && key !== "engagementTypes"} /></label>)}
                    <label className="form-label">Notes<textarea className="form-input" rows="4" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
                    <button className="standard-button" type="submit">Save contact</button>
                </form>}
                <section className="adminMemoryList" aria-label="Contact list">
                    {contacts.length ? contacts.map((contact) => <article className="adminMemoryCard editorial-card" key={contact._id}><h2>{contact.name}</h2><p><strong>{contact.role}</strong>{contact.role && " · "}{contact.organization}</p><p>{contact.contactMethod}</p>{contact.notes && <p>{contact.notes}</p>}<small>{contact.engagementTypes?.join(" · ")}</small></article>) : <p className="adminMemoryEmpty">No contacts match this search.</p>}
                </section>
            </main>
        </AdminRoute>
    );
}

export default AdminContacts;
