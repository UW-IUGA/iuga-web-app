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
                {can("events.requests.view") && <NavLink to="/admin/event-requests">Event requests</NavLink>}
            </nav>
            <Link to="/" className="adminNavigation__exit">Back to student site</Link>
        </header>
    );
}

export default AdminNavigation;
