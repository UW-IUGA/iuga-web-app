import React, { useState, useEffect } from "react";
import { Link } from 'react-router-dom';
import Button from "../components/Button.jsx"

function Navbar({signIn, signOut, isAuthenticated}) {
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
            <Link to="/contact">Contact Us</Link>
            <span></span>
            {
                isAuthenticated
                    ? <Button color="primary" callback={signOut} text="Logout" /> 
                    : <Button color="primary" callback={signIn} text="UW NetID Login" />
            }
        </nav>
    )
}

export default Navbar;