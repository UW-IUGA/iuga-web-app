import { useAuthContext } from "../context/AuthContext";

function AdminRoute({ requiredPermission, children }) {
    const { authLoading, isAuthenticated, can, signIn } = useAuthContext();

    if (authLoading) {
        return <main className="baseContainer adminPage"><p role="status">Checking your access…</p></main>;
    }

    if (!isAuthenticated) {
        return (
            <main className="baseContainer adminPage">
                <section className="adminAccessCard editorial-card" aria-labelledby="admin-login-heading">
                    <span className="event-ops-kicker">Exec board workspace</span>
                    <h1 id="admin-login-heading">Sign in to continue</h1>
                    <p>Use your UW NetID to access IUGA administration tools.</p>
                    <button type="button" className="cta-secondary" onClick={signIn}>Sign in with UW NetID</button>
                </section>
            </main>
        );
    }

    if (!can(requiredPermission)) {
        return (
            <main className="baseContainer adminPage">
                <section className="adminAccessCard editorial-card" aria-labelledby="admin-denied-heading">
                    <span className="event-ops-kicker">Exec board workspace</span>
                    <h1 id="admin-denied-heading">Access unavailable</h1>
                    <p>Your account is signed in, but it does not have permission to view this workspace.</p>
                </section>
            </main>
        );
    }

    return children;
}

export default AdminRoute;
