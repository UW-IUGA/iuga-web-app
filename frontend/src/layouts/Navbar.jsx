import React, { useState, useEffect } from "react";
import { NavLink } from 'react-router-dom';
import Button from "../components/Button.jsx"
import { useAuthContext } from "../context/AuthContext";

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars} from '@fortawesome/free-solid-svg-icons'

function Navbar({signIn, signOut}) {
    const { isAuthenticated, user } = useAuthContext();
    const [isScrolledDown, setScrolledDown] = useState(false);
    const [showMenu, setMenu] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolledDown(window.scrollY > 0);
        };

        window.addEventListener('scroll', handleScroll);

        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav>
            <div className={`nav-container ${isScrolledDown > 0 ? "nav-scroll" : ""}`}>
                <div className="nav-header">
                    <NavLink to="/" className="nav-logo"><img src="/iuga-logo.png" alt="logo"></img></NavLink>
                    <span></span>
                    <div className="nav-mobile-menu" onClick={() => setMenu(!showMenu)}>
                        <FontAwesomeIcon icon={faBars} />
                    </div>
                </div>
                <div className={`nav-items-wrapper ${showMenu ? "nav-show-items" : "nav-hide-items"}`}>
                    <NavLink to="/events">Events</NavLink>
                    <NavLink to="/resources">Resources</NavLink>
                    <NavLink to="/about">About</NavLink>
                    <NavLink to="/elections">Elections</NavLink>
                    <NavLink to="/electionfaq">Election FAQ</NavLink>
                    <span></span>
                    <div className="nav-button-wrapper">
                        { isAuthenticated && user && (<p>Hi, {user.uFirstName ? user.uFirstName : user.uDisplayName}!</p>) }
                        {
                            isAuthenticated
                                ? <Button className="secondary-button" onClick={signOut} text="Logout" />
                                : <Button className="secondary-button" onClick={signIn} text="UW NetID Login" />
                        }
                    </div>
                </div>
            </div>
            <span className={`nav-border ${isScrolledDown > 0 ? "nav-border-scroll" : ""}`}></span>
        </nav>
    )
}

export default Navbar;