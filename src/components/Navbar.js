import React from 'react';
import { Link } from 'react-router-dom';
import "./Navbar.css"
import DottedButton from "./DottedButton.jsx"

function Navbar() {
    return (
        <nav>
            <Link to="/">IUGA</Link>
            <Link to="/events">Events</Link>
            <Link to="/resources">Resources</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact Us</Link>
            <DottedButton>Login</DottedButton>
        </nav>
    )
}

export default Navbar;