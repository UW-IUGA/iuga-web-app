import React from 'react';
import { Link } from 'react-router-dom';

function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer>
            <div className="footerContainer">
                <div className="footerTopRow">
                    <Link to="/" className="footerLogo"><img src="/iuga-logo.png" alt="IUGA logo, links to home"></img></Link>
                    <div className="footerLinks">
                        <Link to="/events">Events</Link>
                        <Link to="/get-involved">Get Involved</Link>
                    </div>
                </div>
                <div className="footerBottomRow">
                    <p className="footerCopyright">© {year} Informatics Undergraduate Association</p>
                    <div className="footerSocials">
                        <a href="mailto:iuga@uw.edu"><img src="/assets/icons/email-icon.svg" alt="Email IUGA"/></a>
                        <a href="https://www.facebook.com/groups/232675096843082" target="_blank" rel="noreferrer"><img src="/assets/icons/facebook-icon.svg" alt="IUGA on Facebook"/></a>
                        <a href="https://www.instagram.com/iuga.info/" target="_blank" rel="noreferrer"><img src="/assets/icons/instagram-icon.svg" alt="IUGA on Instagram"/></a>
                        <a href="https://discord.gg/8BnBYkaKd4" target="_blank" rel="noreferrer"><img id="discord-footer-item" src="/assets/icons/discord-icon.svg" alt="IUGA on Discord"/></a>
                        <a href="https://www.linkedin.com/company/informatics-undergraduate-association-iuga-" target="_blank" rel="noreferrer"><img id="linkedin-footer-item" src="/assets/icons/linkedin-icon.svg" alt="IUGA on LinkedIn"/></a>
                    </div>
                </div>
            </div>
        </footer>
    )
}

export default Footer;
