import { useState } from "react";
import { NavLink } from 'react-router-dom';
import { useAuthContext } from "../context/AuthContext";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";

function Navbar({ signIn, signOut }) {
    const [showMenu, setMenu] = useState(false);
    const { isAuthenticated, user } = useAuthContext();
    const userGreeting = user?.uFirstName || user?.uDisplayName || user?.name || user?.email;

    return (
        <nav>
            <div className="nav-container">
                <div className="nav-header">
                    <NavLink to="/" className="nav-logo"><img src="/iuga-logo.png" alt="IUGA logo, links to home"></img></NavLink>
                    <span></span>
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
                    <NavLink to="/" end>Home</NavLink>
                    <NavLink to="/events">Events</NavLink>
                    <NavLink to="/resources">Resources</NavLink>
                    <NavLink to="/student-voice">Student Voice</NavLink>
                    <NavLink to="/about">About Us</NavLink>
                    <span className="nav-shop">Shop</span>
                    <NavLink to="/get-involved">Get Involved</NavLink>
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
        </nav>
    )
}

export default Navbar;
