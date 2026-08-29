import { useEffect, useState } from "react";
import AdminRoute from "../components/AdminRoute";
import { useAuthContext } from "../context/AuthContext";
import { adminRequest } from "../utils/adminApi";

const ROLE_CONTEXTS = [
    { permission: "events.leadership.approve", title: "President / Vice President", description: "Review incoming requests and move viable events to the agenda." },
    { permission: "events.meeting.manage", title: "Exec Board", description: "Record meeting outcomes and keep agenda items moving." },
    { permission: "events.finance.manage", title: "Director of Finance", description: "Review funding decisions and protect the academic-year budget." },
    { permission: "events.marketing.manage", title: "Director of PR", description: "Complete marketing handoffs after funding is approved." },
    { permission: "events.review.manage", title: "Post-event review", description: "Track outcomes and capture institutional memory." },
];

function AdminDashboard() {
    const [dashboard, setDashboard] = useState({ queues: [], ownRequests: [], stalled: [], activeCycle: null });
    const [notifications, setNotifications] = useState([]);
    const [error, setError] = useState("");
    const { can } = useAuthContext();
    const roleContexts = ROLE_CONTEXTS.filter(({ permission }) => can(permission));
    const canSeeBudget = can("events.finance.manage") || can("events.leadership.approve");

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
                <header className="adminPageHeader">
                    <span className="event-ops-kicker">Exec board workspace</span>
                    <h1>Board dashboard</h1>
                    <p>See decisions, handoffs, and follow-up work that need attention.</p>
                </header>
                {error && <p className="event-ops-error" role="alert">{error}</p>}
                {roleContexts.length > 0 && <section className="adminMemoryList" aria-label="Your responsibilities"><h2>Your responsibilities</h2><div className="adminDashboardGrid">{roleContexts.map((role) => <article className="adminMemoryCard editorial-card" key={role.permission}><span className="event-ops-kicker">Role view</span><h2>{role.title}</h2><p>{role.description}</p></article>)}</div></section>}
                {canSeeBudget && dashboard.activeCycle && <section className="adminDashboardBudget editorial-card"><span className="event-ops-kicker">{dashboard.activeCycle.cycleName}</span><h2>Budget remaining</h2><p>${((dashboard.activeCycle.budgetTotalCents - (dashboard.activeCycle.budgetCommittedCents || 0)) / 100).toFixed(2)}</p></section>}
                <section className="adminDashboardGrid" aria-label="Action queues">
                    {dashboard.queues.map((queue) => <article className="adminMemoryCard editorial-card" key={queue.key}><span className="event-ops-kicker">{queue.key.replaceAll("_", " ")}</span><h2>{queue.label}</h2><p>{queue.requests.length} {queue.requests.length === 1 ? "request" : "requests"}</p>{queue.requests.slice(0, 5).map((request) => <p className="adminDashboardItem" key={request._id}>{request.title || request.eventName}</p>)}</article>)}
                </section>
                <section className="adminMemoryList" aria-label="Your requests"><h2>Your requests</h2>{dashboard.ownRequests.length ? dashboard.ownRequests.map((request) => <article className="adminMemoryCard editorial-card" key={request._id}><strong>{request.title || request.eventName}</strong><span className="event-ops-status">{request.status}</span>{request.nextResponsibleRole && <small className="adminDashboardMeta">Next: {request.nextResponsibleRole}</small>}</article>) : <p className="adminMemoryEmpty">You have no event requests.</p>}</section>
                {dashboard.stalled.length > 0 && <section className="adminMemoryList" aria-label="Stalled requests"><h2>Stalled requests</h2>{dashboard.stalled.map((request) => <article className="adminMemoryCard editorial-card" key={request._id}><strong>{request.title || request.eventName}</strong><p>Last updated {new Date(request.updatedAt).toLocaleDateString()}</p>{request.nextResponsibleRole && <small className="adminDashboardMeta">Responsible role: {request.nextResponsibleRole}</small>}</article>)}</section>}
                {notifications.length > 0 && <section className="adminMemoryList" aria-label="Notifications"><h2>Notifications</h2>{notifications.slice(0, 5).map((notification) => <article className="adminMemoryCard editorial-card" key={notification._id}>{notification.comment || notification.decision}</article>)}</section>}
            </main>
        </AdminRoute>
    );
}

export default AdminDashboard;
