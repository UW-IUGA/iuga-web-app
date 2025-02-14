import React from 'react';
import { Link } from 'react-router-dom';

function Footer() {
    return (
        <footer>
            <div className="footerContainer">
                <div>
                    <Link to="/"><img src="/iuga-logo.png" alt="logo"></img></Link>
                    <div></div>
                    <div>
                        <Link to="/events">Events</Link>
                        <Link to="/resources">Resources</Link>
                        <Link to="/about">About</Link>
                        <Link to="/electionfaq">Election FAQ</Link>
                        <Link to="https://status.iuga.info">Status</Link>
                    </div>
                </div>
                <div>
                    <p>Developed with 💕 by the IUGA Website Committee 2023</p>
                    <div></div>
                    <div>
                        <a href="mailto:iuga@uw.edu"><img src="/assets/icons/email-icon.svg" alt="email icon"/></a>
                        <a href="https://www.facebook.com/groups/232675096843082" target="_blank" rel="noreferrer"><img src="/assets/icons/facebook-icon.svg" alt="facebook icon"/></a>
                        <a href="https://www.instagram.com/iuga.info/" target="_blank" rel="noreferrer"><img src="/assets/icons/instagram-icon.svg" alt="instagram icon"/></a>
                        <a href="https://discord.gg/8BnBYkaKd4" target="_blank" rel="noreferrer"><img id="discord-footer-item" src="/assets/icons/discord-icon.svg" alt="discord icon"/></a>
                        <a href="https://www.linkedin.com/company/informatics-undergraduate-association-iuga-" target="_blank" rel="noreferrer"><img id="linkedin-footer-item" src="/assets/icons/linkedin-icon.svg" alt="linkedin icon"/></a>
                    </div>
                </div>
            </div>
        </footer>
    )
}

export default Footer;