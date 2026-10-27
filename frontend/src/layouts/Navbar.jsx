/*
 * Purpose: Shared responsive navigation and account controls for every page.
 * Authentication/Authorization Requirements: UW NetID controls reflect the active auth session; the Admin link
 *     appears only to users holding at least one admin permission.
 * Expected Request Information: Receives sign-in and sign-out callbacks from the app shell.
 * Expected Response Information: Renders navigation links and account actions, the light/dark switch, and hosts
 *     the shop cart icon when present.
 */

import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { ADMIN_ROOT_PATH, visibleAdminSections } from "../adminSections";
import ThemeToggle from "../components/ThemeToggle";
import PrototypeNavIndicator from "../prototype/PrototypeNavIndicator";
import { usePrototypeShownPath } from "../prototype/PrototypePageTransition";
import { prototypeTransition } from "../prototype/prototypePageTransitions";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faBars,
    faChevronDown,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";

// A toggle button and the panel it shows. Focus leaving the dropdown closes it.
function NavDropdown({ menuId, label, toggleLabel, open, current, onToggle, onDismiss, children }) {
    return (
        <div className="nav-dropdown" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) onDismiss();
        }}>
            <button type="button" className={`nav-toggle ${current ? "active" : ""}`} aria-label={toggleLabel} aria-expanded={open} aria-controls={menuId} onClick={onToggle}>
                {label} <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
            </button>
            {open && <div className="nav-dropdown-menu" id={menuId}>{children}</div>}
        </div>
    );
}

function Navbar({ signIn, signOut }) {
    const [showMenu, setMenu] = useState(false);
    const [openDropdown, setOpenDropdown] = useState(null);
    const { pathname } = useLocation();
    const prototypeShownPath = usePrototypeShownPath();
    const prototypeIndicator = Boolean(prototypeTransition()?.navIndicator) && prototypeShownPath !== null;
    const { isAuthenticated, user, can } = useAuthContext();
    const userGreeting = user?.uFirstName || user?.uDisplayName || user?.name || user?.email || "Your account";
    const showAdminLink = visibleAdminSections(can).length > 0;
    const closeMenu = () => {
        setMenu(false);
        setOpenDropdown(null);
    };
    const handleNavigation = (event) => {
        closeMenu();
        if (event.detail > 0) event.currentTarget.blur();
    };
    const dropdownProps = (name) => ({
        open: openDropdown === name,
        onToggle: () => setOpenDropdown((current) => (current === name ? null : name)),
        onDismiss: () => setOpenDropdown((current) => (current === name ? null : current)),
    });

    useEffect(() => {
        setMenu(false);
        setOpenDropdown(null);
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
                    <div className={`nav-primary-links${prototypeIndicator ? " prototypeNavLinks" : ""}`}>
                        <NavLink to="/events" onClick={handleNavigation}>Events</NavLink>
                        <NavLink to="/resources" onClick={handleNavigation}>Resources</NavLink>
                        <NavLink to="/student-voice" onClick={handleNavigation}>Student Voice</NavLink>
                        <NavLink to="/shop" onClick={handleNavigation}>Shop</NavLink>
                        <NavLink to="/about" onClick={handleNavigation}>About</NavLink>
                        <NavLink to="/get-involved" onClick={handleNavigation}>Get Involved</NavLink>
                        {showAdminLink && <NavLink to={ADMIN_ROOT_PATH} onClick={handleNavigation}>Admin</NavLink>}
                        {prototypeIndicator && <PrototypeNavIndicator path={prototypeShownPath} />}
                    </div>
                    <div className="nav-account">
                        {isAuthenticated ? (
                            <NavDropdown menuId="nav-account-menu" label={userGreeting} toggleLabel={`${userGreeting} account`} {...dropdownProps("account")}>
                                <button type="button" onClick={() => { closeMenu(); signOut(); }}>Sign out</button>
                            </NavDropdown>
                        ) : (
                            <button type="button" className="nav-toggle" onClick={signIn}>Sign in</button>
                        )}
                    </div>
                </div>
                <div className="nav-account-cart-slot" id="shop-cart-slot" />
                {/* Outside the phone menu, so the switch stays in the bar on every screen size. */}
                <ThemeToggle />
                <button
                    type="button"
                    className="nav-mobile-menu"
                    onClick={() => { setMenu(!showMenu); setOpenDropdown(null); }}
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
