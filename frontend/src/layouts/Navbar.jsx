import React from 'react';
import { Link } from 'react-router-dom';
import Button from "../components/Button.jsx"

function Navbar({signIn, signOut, isAuthenticated}) {
    return (
        <nav>
            <Link to="/"><img src="/iuga-logo.png" alt="logo"></img></Link>
            <Link to="/events">Events</Link>
            <Link to="/resources">Resources</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact Us</Link>
            <span></span>
            {
                isAuthenticated
                    ? <Button callback={signOut} text="Logout" /> 
                    : <Button callback={signIn} text="UW NetID Login" />
            }
        </nav>
    )
}

export default Navbar;