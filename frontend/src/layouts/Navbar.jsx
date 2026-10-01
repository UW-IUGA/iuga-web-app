/*
 * Purpose: Shared responsive navigation and account controls for every page.
 * Authentication/Authorization Requirements: UW NetID controls reflect the active auth session.
 * Expected Request Information: Receives sign-in and sign-out callbacks from the app shell.
 * Expected Response Information: Renders navigation links and account actions; hosts the shop cart icon when present.
 */

import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faBars,
    faChevronDown,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";

function Navbar({ signIn, signOut }) {
    const [showMenu, setMenu] = useState(false);
    const [showAccount, setAccount] = useState(false);
    const { pathname } = useLocation();
    const { isAuthenticated, user } = useAuthContext();
    const userGreeting = user?.uFirstName || user?.uDisplayName || user?.name || user?.email || "Your account";
    const closeMenu = () => {
        setMenu(false);
        setAccount(false);
    };
    const handleNavigation = (event) => {
        closeMenu();
        if (event.detail > 0) event.currentTarget.blur();
    };

    useEffect(() => {
        setMenu(false);
        setAccount(false);
    }, [pathname]);

    return (
        <nav className="site-navigation" aria-label="Primary navigation" onKeyDown={(event) => {
            if (event.key === "Escape") closeMenu();
        }}>
            <div className="nav-container">
                <div className="nav-header">
                    <NavLink to="/" className="nav-logo" onClick={handleNavigation}>
                        <img src="/iuga-logo.png" alt="IUGA home" />
                    </NavLink>
                </div>
                <div id="nav-items" className={`nav-items-wrapper ${showMenu ? "nav-show-items" : ""}`}>
                    <div className="nav-primary-links">
                        <NavLink to="/events" onClick={handleNavigation}>Events</NavLink>
                        <NavLink to="/resources" onClick={handleNavigation}>Resources</NavLink>
                        <NavLink to="/student-voice" onClick={handleNavigation}>Student Voice</NavLink>
                        <NavLink to="/shop" onClick={handleNavigation}>Shop</NavLink>
                        <NavLink to="/about" onClick={handleNavigation}>About</NavLink>
                        <NavLink to="/get-involved" onClick={handleNavigation}>Get Involved</NavLink>
                    </div>
                    <div className="nav-account">
                        {isAuthenticated ? (
                            <div className="nav-account-dropdown" onBlur={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget)) setAccount(false);
                            }}>
                                <button type="button" className="nav-account-toggle" aria-label={`${userGreeting} account`} aria-expanded={showAccount} aria-controls="nav-account-actions" onClick={() => setAccount(!showAccount)}>
                                    {userGreeting} <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
                                </button>
                                {showAccount && <div className="nav-account-actions" id="nav-account-actions">
                                    <span>Signed in with UW NetID</span>
                                    <button type="button" onClick={() => { closeMenu(); signOut(); }}>Sign out</button>
                                </div>}
                            </div>
                        ) : (
                            <button type="button" className="nav-account-toggle" onClick={signIn}>Sign in</button>
                        )}
                    </div>
                </div>
                <div className="nav-account-cart-slot" id="shop-cart-slot" />
                <button
                    type="button"
                    className="nav-mobile-menu"
                    onClick={() => { setMenu(!showMenu); setAccount(false); }}
                    aria-expanded={showMenu}
                    aria-controls="nav-items"
                    aria-label={showMenu ? "Close menu" : "Open menu"}
                >
                    <FontAwesomeIcon icon={showMenu ? faXmark : faBars} aria-hidden="true" />
                </button>
            </div>
        </nav>
    )
}

export default Navbar;
