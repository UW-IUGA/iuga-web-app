import { NavLink, Link } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";

function AdminNavigation() {
    const { can } = useAuthContext();

    return (
        <header className="adminNavigation">
            <div className="adminNavigation__heading">
                <Link to="/" className="adminNavigation__brand">IUGA</Link>
                <span>Exec board workspace</span>
            </div>
            <nav aria-label="Admin navigation" className="adminNavigation__links">
                {can("dashboard.read") && <NavLink to="/admin">Dashboard</NavLink>}
                {can("events.requests.view") && <NavLink to="/admin/event-requests">Event requests</NavLink>}
                {can("charter.read") && <NavLink to="/admin/charter">Charter</NavLink>}
                {can("journal.read") && <NavLink to="/admin/journal">Journal</NavLink>}
                {can("contacts.read") && <NavLink to="/admin/contacts">Contacts</NavLink>}
                {can("exports.manage") && <a href="/api/v1/exports/event-requests.csv">Export requests</a>}
            </nav>
            <Link to="/" className="adminNavigation__exit">Back to student site</Link>
        </header>
    );
}

export default AdminNavigation;
