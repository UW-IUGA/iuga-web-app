import React, { useState, useEffect } from "react";
import { NavLink } from 'react-router-dom';
import Button from "../components/Button.jsx"
import { useAuthContext } from "../context/AuthContext";

function Navbar({signIn, signOut}) {
    const { isAuthenticated, user } = useAuthContext();
    const [isScrolledDown, setScrolledDown] = useState(false);

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
                <NavLink to="/" className="nav-logo"><img src="/iuga-logo.png" alt="logo"></img></NavLink>
                <span></span>
                <NavLink to="/events">Events</NavLink>
                <NavLink to="/resources">Resources</NavLink>
                <NavLink to="/about">About</NavLink>
                <span></span>
                <div>
                    { isAuthenticated && user && (<p>Hi, {user.uFirstName ? user.uFirstName : user.uDisplayName}!</p>) }
                    {
                        isAuthenticated
                            ? <Button className="secondary-button" onClick={signOut} text="Logout" />
                            : <Button className="secondary-button" onClick={signIn} text="UW NetID Login" />
                    }
                </div>
            </div>
            <span className={`nav-border ${isScrolledDown > 0 ? "nav-border-scroll" : ""}`}></span>
        </nav>
    )
}

export default Navbar;