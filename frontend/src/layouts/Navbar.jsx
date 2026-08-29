import { useEffect, useState } from "react";
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthContext } from "../context/AuthContext";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
    faBars,
    faBookOpen,
    faBullhorn,
    faCalendarDays,
    faHand,
    faHouse,
    faRightFromBracket,
    faShirt,
    faUsers,
} from "@fortawesome/free-solid-svg-icons";

function Navbar({ signIn, signOut }) {
    const [showMenu, setMenu] = useState(false);
    const { pathname } = useLocation();
    const { isAuthenticated, user, can } = useAuthContext();
    const userGreeting = user?.uFirstName || user?.uDisplayName || user?.name || user?.email;
    const userType = user?.uType || "IUGA member";
    const avatarInitial = userGreeting?.trim().charAt(0).toUpperCase() || "I";
    const closeMenu = () => setMenu(false);
    const handleNavigation = (event) => {
        closeMenu();
        if (event.detail > 0) event.currentTarget.blur();
    };

    useEffect(() => {
        setMenu(false);
    }, [pathname]);

    return (
        <nav aria-label="Primary navigation">
            <NavLink to="/" className="nav-logo nav-logo-desktop" onClick={handleNavigation}>
                <img src="/iuga-logo.png" alt="IUGA home" />
            </NavLink>
            <div className={`nav-container ${showMenu ? "nav-menu-open" : ""}`}>
                <div className="nav-header">
                    <NavLink to="/" className="nav-logo nav-logo-mobile" onClick={handleNavigation}>
                        <img src="/iuga-logo.png" alt="IUGA home" />
                    </NavLink>
                    <button
                        type="button"
                        className="nav-mobile-menu"
                        onClick={() => setMenu(!showMenu)}
                        aria-expanded={showMenu}
                        aria-controls="nav-items"
                        aria-label={showMenu ? "Close menu" : "Open menu"}
                    >
                        <FontAwesomeIcon icon={faBars} aria-hidden="true" />
                    </button>
                </div>
                <div id="nav-items" className={`nav-items-wrapper ${showMenu ? "nav-show-items" : "nav-hide-items"}`}>
                    <NavLink to="/" end onClick={handleNavigation}><FontAwesomeIcon icon={faHouse} aria-hidden="true" /><span>Home</span></NavLink>
                    <NavLink to="/events" onClick={handleNavigation}><FontAwesomeIcon icon={faCalendarDays} aria-hidden="true" /><span>Events</span></NavLink>
                    <NavLink to="/resources" onClick={handleNavigation}><FontAwesomeIcon icon={faBookOpen} aria-hidden="true" /><span>Resources</span></NavLink>
                    <NavLink to="/student-voice" onClick={handleNavigation}><FontAwesomeIcon icon={faBullhorn} aria-hidden="true" /><span>Student Voice</span></NavLink>
                    <NavLink to="/about" onClick={handleNavigation}><FontAwesomeIcon icon={faUsers} aria-hidden="true" /><span>About Us</span></NavLink>
                    <NavLink to="/shop" onClick={handleNavigation}><FontAwesomeIcon icon={faShirt} aria-hidden="true" /><span>Shop</span></NavLink>
                    <NavLink to="/get-involved" onClick={handleNavigation}><FontAwesomeIcon icon={faHand} aria-hidden="true" /><span>Get Involved</span></NavLink>
                    {isAuthenticated && can("events.requests.view") && <NavLink to="/admin/event-requests" onClick={handleNavigation}><FontAwesomeIcon icon={faUsers} aria-hidden="true" /><span>Admin</span></NavLink>}
                    <span></span>
                    <div className="nav-auth">
                        {isAuthenticated ? (
                            <>
                                {userGreeting && <span className="nav-auth-greeting">Hi, {userGreeting}</span>}
                                <button type="button" className="nav-auth-button" onClick={signOut}>Logout</button>
                            </>
                        ) : (
                            <button type="button" className="nav-auth-button" onClick={signIn}>UW NetID Login</button>
                        )}
                    </div>
                </div>
            </div>
            <div className="nav-account-float">
                {isAuthenticated ? (
                    <div className="nav-account-profile">
                        <span className="nav-account-avatar" aria-hidden="true">{avatarInitial}</span>
                        <div className="nav-account-copy">
                            <strong>Welcome back, {userGreeting || "there"}</strong>
                            <span>{userType}</span>
                        </div>
                        <button type="button" className="nav-account-logout" onClick={signOut} aria-label="Logout">
                            <FontAwesomeIcon icon={faRightFromBracket} aria-hidden="true" />
                        </button>
                    </div>
                ) : (
                    <button type="button" className="nav-account-login pill-button" onClick={signIn} aria-label="Sign in with UW NetID">
                        <span>UW NetID</span>
                    </button>
                )}
            </div>
        </nav>
    )
}

export default Navbar;
