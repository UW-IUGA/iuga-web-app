import { useEffect, useState } from "react";
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthContext } from "../context/AuthContext";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";

function Navbar({ signIn, signOut }) {
    const [showMenu, setMenu] = useState(false);
    const { pathname } = useLocation();
    const { isAuthenticated, user } = useAuthContext();
    const userGreeting = user?.uFirstName || user?.uDisplayName || user?.name || user?.email;
    const closeMenu = () => setMenu(false);

    useEffect(() => {
        setMenu(false);
    }, [pathname]);

    return (
        <nav>
            <div className={`nav-container ${showMenu ? "nav-menu-open" : ""}`}>
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
                    <NavLink to="/" className="nav-logo" onClick={closeMenu}><img src="/iuga-logo.png" alt="IUGA logo, links to home"></img></NavLink>
                    <span></span>
                </div>
                <div id="nav-items" className={`nav-items-wrapper ${showMenu ? "nav-show-items" : "nav-hide-items"}`}>
                    <NavLink to="/" end onClick={closeMenu}>Home</NavLink>
                    <NavLink to="/events" onClick={closeMenu}>Events</NavLink>
                    <NavLink to="/resources" onClick={closeMenu}>Resources</NavLink>
                    <span className="nav-shop">Shop</span>
                    <NavLink to="/get-involved" onClick={closeMenu}>Get Involved</NavLink>
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
