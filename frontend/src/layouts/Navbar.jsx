import React, { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import Button from "../components/Button.jsx"

function Navbar({signIn, signOut}) {
    const { accounts } = useMsal();
    const isAuthenticated = useIsAuthenticated();
    const [isScrolledDown, setScrolledDown] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolledDown(window.scrollY > 0);
        };

        window.addEventListener('scroll', handleScroll);

        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <nav className={`${isScrolledDown > 0 ? "navBorder" : ""}`}>
            <Link to="/"><img src="/iuga-logo.png" alt="logo"></img></Link>
            <span></span>
            <Link to="/events">Events</Link>
            <Link to="/resources">Resources</Link>
            <Link to="/about">About</Link>
            <span></span>
            <div>
            { isAuthenticated && (<p>{accounts[0]?.username}</p>) }
            {
                isAuthenticated
                    ? <Button className="secondary-button" callback={signOut} text="Logout" />
                    : <Button className="secondary-button" callback={signIn} text="UW NetID Login" />
            }
            </div>
        </nav>
    )
}

export default Navbar;