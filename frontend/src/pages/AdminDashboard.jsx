import { useEffect, useState } from "react";
import AdminRoute from "../components/AdminRoute";
import { adminRequest } from "../utils/adminApi";

function AdminDashboard() {
    const [dashboard, setDashboard] = useState({ queues: [], ownRequests: [], stalled: [], activeCycle: null });
    const [notifications, setNotifications] = useState([]);
    const [error, setError] = useState("");

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
                {dashboard.activeCycle && <section className="adminDashboardBudget editorial-card"><span className="event-ops-kicker">{dashboard.activeCycle.cycleName}</span><h2>Budget remaining</h2><p>${((dashboard.activeCycle.budgetTotalCents - (dashboard.activeCycle.budgetCommittedCents || 0)) / 100).toFixed(2)}</p></section>}
                <section className="adminDashboardGrid" aria-label="Action queues">
                    {dashboard.queues.map((queue) => <article className="adminMemoryCard editorial-card" key={queue.key}><span className="event-ops-kicker">{queue.key.replaceAll("_", " ")}</span><h2>{queue.label}</h2><p>{queue.requests.length} {queue.requests.length === 1 ? "request" : "requests"}</p>{queue.requests.slice(0, 5).map((request) => <p className="adminDashboardItem" key={request._id}>{request.title || request.eventName}</p>)}</article>)}
                </section>
                <section className="adminMemoryList" aria-label="Your requests"><h2>Your requests</h2>{dashboard.ownRequests.length ? dashboard.ownRequests.map((request) => <article className="adminMemoryCard editorial-card" key={request._id}><strong>{request.title || request.eventName}</strong><span className="event-ops-status">{request.status}</span></article>) : <p className="adminMemoryEmpty">You have no event requests.</p>}</section>
                {dashboard.stalled.length > 0 && <section className="adminMemoryList" aria-label="Stalled requests"><h2>Stalled requests</h2>{dashboard.stalled.map((request) => <article className="adminMemoryCard editorial-card" key={request._id}><strong>{request.title || request.eventName}</strong><p>Last updated {new Date(request.updatedAt).toLocaleDateString()}</p></article>)}</section>}
                {notifications.length > 0 && <section className="adminMemoryList" aria-label="Notifications"><h2>Notifications</h2>{notifications.slice(0, 5).map((notification) => <article className="adminMemoryCard editorial-card" key={notification._id}>{notification.comment || notification.decision}</article>)}</section>}
            </main>
        </AdminRoute>
    );
}

export default AdminDashboard;
