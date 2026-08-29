import AdminRoute from "../components/AdminRoute";
import EventOperations from "../components/EventOperations";
import { useAuthContext } from "../context/AuthContext";

function AdminEventRequests() {
    const { can } = useAuthContext();

    return (
        <AdminRoute requiredPermission="events.requests.view">
            <main className="baseContainer adminPage">
                <header className="adminPageHeader">
                    <span className="event-ops-kicker">Exec board workspace</span>
                    <h1>Event request administration</h1>
                    <p>Review submissions and coordinate each event from proposal through completion.</p>
                </header>
                <EventOperations can={can} />
            </main>
        </AdminRoute>
    );
}

export default AdminEventRequests;
