import { useState } from "react";
import { NavLink } from 'react-router-dom';
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
    faRightToBracket,
    faShop,
    faUsers,
} from "@fortawesome/free-solid-svg-icons";

function Navbar({ signIn, signOut }) {
    const [showMenu, setMenu] = useState(false);
    const { isAuthenticated, user } = useAuthContext();
    const userGreeting = user?.uFirstName || user?.uDisplayName || user?.name || user?.email;
    const userType = user?.uType || "IUGA member";
    const avatarInitial = userGreeting?.trim().charAt(0).toUpperCase() || "I";

    return (
        <nav aria-label="Primary navigation">
            <NavLink to="/" className="nav-logo">
                <img src="/iuga-logo.png" alt="IUGA home" />
            </NavLink>
            <div className="nav-container">
                <div className="nav-header">
                    <button
                        type="button"
                        className="nav-mobile-menu"
                        onClick={() => setMenu(!showMenu)}
                        aria-expanded={showMenu}
                        aria-controls="nav-items"
                        aria-label={showMenu ? "Close menu" : "Open menu"}
                    >
                        <FontAwesomeIcon icon={faBars} />
                    </button>
                </div>
                <div id="nav-items" className={`nav-items-wrapper ${showMenu ? "nav-show-items" : "nav-hide-items"}`}>
                    <NavLink to="/" end><FontAwesomeIcon icon={faHouse} /><span>Home</span></NavLink>
                    <NavLink to="/events"><FontAwesomeIcon icon={faCalendarDays} /><span>Events</span></NavLink>
                    <NavLink to="/resources"><FontAwesomeIcon icon={faBookOpen} /><span>Resources</span></NavLink>
                    <NavLink to="/student-voice"><FontAwesomeIcon icon={faBullhorn} /><span>Student Voice</span></NavLink>
                    <NavLink to="/about"><FontAwesomeIcon icon={faUsers} /><span>About Us</span></NavLink>
                    <span className="nav-shop"><FontAwesomeIcon icon={faShop} /><span>Shop</span></span>
                    <NavLink to="/get-involved"><FontAwesomeIcon icon={faHand} /><span>Get Involved</span></NavLink>
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
                            <FontAwesomeIcon icon={faRightFromBracket} />
                        </button>
                    </div>
                ) : (
                    <button type="button" className="nav-account-login pill-button homePrimaryLink" onClick={signIn}>
                        <FontAwesomeIcon icon={faRightToBracket} />
                        <span>Login</span>
                    </button>
                )}
            </div>
        </nav>
    )
}

export default Navbar;
