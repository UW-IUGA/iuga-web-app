import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AdminRoute from "../components/AdminRoute";
import EventRequestForm from "../components/events/EventRequestForm";
import { useAuthContext } from "../context/AuthContext";
import { adminRequest } from "../utils/adminApi";

function RequestLink({ request, children }) {
    return <Link className="adminDashboardItem" to={`/admin/pipeline/${request._id}`}>{children}</Link>;
}

function AdminDashboard() {
    const [dashboard, setDashboard] = useState({ queues: [], ownRequests: [], stalled: [], activeCycle: null });
    const [notifications, setNotifications] = useState([]);
    const [error, setError] = useState("");
    const [showForm, setShowForm] = useState(false);
    const { can } = useAuthContext();
    const navigate = useNavigate();
    const canSeeBudget = can("events.finance.manage") || can("events.leadership.approve");
    const canCreate = can("events.requests.create");

    useEffect(() => {
        const load = async () => {
            try {
                const [loadedDashboard, loadedNotifications] = await Promise.all([
                    adminRequest("dashboard"),
                    adminRequest("notifications").catch(() => ({ notifications: [] })),
                ]);
                setDashboard(loadedDashboard);
                setNotifications(loadedNotifications.notifications || []);
            } catch (requestError) {
                setError(requestError.message);
            }
        };
        load();
    }, []);

    return (
        <AdminRoute requiredPermission="dashboard.read">
            <main className="baseContainer adminPage">
                <header className="adminPageHeader adminDashboardHeader">
                    <div>
                        <span className="event-ops-kicker">Exec board workspace</span>
                        <h1>Board dashboard</h1>
                        <p>See decisions, handoffs, and follow-up work that need attention.</p>
                    </div>
                    {canCreate && <button className="cta-secondary" type="button" onClick={() => setShowForm((visible) => !visible)}>{showForm ? "Close form" : "+ New request"}</button>}
                </header>
                {error && <p className="event-ops-error" role="alert">{error}</p>}
                {showForm && canCreate && <EventRequestForm activeCycle={dashboard.activeCycle} onCancel={() => setShowForm(false)} onCreated={(created) => navigate(`/admin/pipeline/${created._id}`)} />}

                {canSeeBudget && dashboard.activeCycle && <section className="adminDashboardBudget editorial-card"><span className="event-ops-kicker">{dashboard.activeCycle.cycleName}</span><h2>Budget remaining</h2><p>${((dashboard.activeCycle.budgetTotalCents - (dashboard.activeCycle.budgetCommittedCents || 0)) / 100).toFixed(2)}</p></section>}

                <section className="adminDashboardGrid" aria-label="My queue">
                    {dashboard.queues.map((queue) => <article className="adminMemoryCard editorial-card" key={queue.key}>
                        <span className="event-ops-kicker">{queue.key.replaceAll("_", " ")}</span>
                        <h2>{queue.label}</h2>
                        <p>{queue.requests.length} {queue.requests.length === 1 ? "request" : "requests"}</p>
                        {queue.requests.slice(0, 5).map((request) => <RequestLink key={request._id} request={request}>{request.title || request.eventName}</RequestLink>)}
                    </article>)}
                </section>

                <section className="adminMemoryList" aria-label="Your requests">
                    <h2>Your requests</h2>
                    {dashboard.ownRequests.length
                        ? dashboard.ownRequests.map((request) => <Link className="adminMemoryCard editorial-card adminDashboardRow" key={request._id} to={`/admin/pipeline/${request._id}`}>
                            <strong>{request.title || request.eventName}</strong>
                            <span className="event-ops-status">{request.status}</span>
                            {request.nextResponsibleRole && <small className="adminDashboardMeta">Next: {request.nextResponsibleRole}</small>}
                        </Link>)
                        : <p className="adminMemoryEmpty">You have no event requests.</p>}
                </section>

                {dashboard.stalled.length > 0 && <section className="adminMemoryList" aria-label="Stalled requests">
                    <h2>Stalled requests</h2>
                    {dashboard.stalled.map((request) => <Link className="adminMemoryCard editorial-card adminDashboardRow" key={request._id} to={`/admin/pipeline/${request._id}`}>
                        <strong>{request.title || request.eventName}</strong>
                        <p>Last updated {new Date(request.updatedAt).toLocaleDateString()}</p>
                        {request.nextResponsibleRole && <small className="adminDashboardMeta">Responsible role: {request.nextResponsibleRole}</small>}
                    </Link>)}
                </section>}

                {notifications.length > 0 && <section className="adminMemoryList" aria-label="Notifications">
                    <h2>Notifications</h2>
                    {notifications.slice(0, 5).map((notification) => <article className="adminMemoryCard editorial-card" key={notification._id}>{notification.comment || notification.decision}</article>)}
                </section>}
            </main>
        </AdminRoute>
    );
}

export default AdminDashboard;
