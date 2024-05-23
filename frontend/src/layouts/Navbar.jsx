import React, { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
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
                <Link to="/" className="nav-logo"><img src="/iuga-logo.png" alt="logo"></img></Link>
                <span></span>
                <Link to="/events">Events</Link>
                <Link to="/resources">Resources</Link>
                <Link to="/about">About</Link>
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