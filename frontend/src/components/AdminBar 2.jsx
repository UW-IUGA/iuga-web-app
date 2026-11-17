/*
Purpose: The top bar of every officer admin page: the admin brand, a link to each admin page the officer may
         use (the open one marked), a link back to the site, and the officer's sign-out.
Authentication/Authorization Requirements: A section's pages appear only to officers holding its permission
         (see adminSections.js). The pages behind the bar check access themselves.
Expected Request Information: The current route and the signed-in officer, both read from the auth context.
Expected Response Information: A header. The link to the open page carries aria-current="page".
*/

import { Link, useLocation } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { ADMIN_ROOT_PATH, visibleAdminSections } from "../adminSections";

export default function AdminBar() {
    const { user, isAuthenticated, signOut, can } = useAuthContext();
    const { pathname } = useLocation();
    const currentPath = pathname.replace(/\/+$/, "");
    const name = user?.uFirstName || user?.uDisplayName || user?.name || user?.email;
    const pages = visibleAdminSections(can).flatMap((section) => section.items);

    return (
        <header className="adminBar">
            <Link className="adminBar__brand" to={ADMIN_ROOT_PATH}>IUGA Admin</Link>
            <nav className="adminBar__pages" aria-label="Admin pages">
                {pages.map((page) => {
                    const current = page.path === currentPath;
                    return (
                        <Link
                            key={page.path}
                            to={page.path}
                            className={current ? "adminBar__page adminBar__page--current" : "adminBar__page"}
                            aria-current={current ? "page" : undefined}
                        >
                            {page.label}
                        </Link>
                    );
                })}
            </nav>
            <div className="adminBar__end">
                <Link className="adminBar__link" to="/">Back to site</Link>
                {isAuthenticated && (
                    <>
                        {name && <span className="adminBar__user">{name}</span>}
                        <button type="button" className="adminBar__signOut" onClick={signOut}>Sign out</button>
                    </>
                )}
            </div>
        </header>
    );
}
