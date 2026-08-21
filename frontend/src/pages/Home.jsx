import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import formalImage from "../assets/iFormal-2026.jpeg";
import bowling from "../assets/gallery/bowling.jpeg";
import groups from "../assets/gallery/groups.jpg";
import heart from "../assets/gallery/heart.jpeg";
import officers from "../assets/gallery/officers-22.png";
import panelists from "../assets/gallery/panelists.jpg";
import merch from "../assets/gallery/merch.jpeg";
function formatEventDate(value) {
    if (!value) return "New details coming soon";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "New details coming soon";

    return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function HomePage({ upcomingEvents }) {
    const { pathname } = useLocation();
    const [contact, setContact] = useState({ name: "", email: "", inquiryType: "", message: "" });
    const [contactStatus, setContactStatus] = useState({ type: "idle", message: "" });
    const featuredEvent = upcomingEvents?.[0];
    const featuredEventName = featuredEvent?.eName || "The next IUGA gathering";
    const featuredEventDate = formatEventDate(featuredEvent?.eStartDate);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    const updateContactField = (event) => {
        const { name, value } = event.target;
        setContact((currentContact) => ({ ...currentContact, [name]: value }));
    };

    const sendContactMessage = async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const website = form.elements.website?.value || "";
        setContactStatus({ type: "submitting", message: "" });

        try {
            const response = await fetch("/api/v1/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...contact, website }),
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(result.message || "We could not send your message. Please try again.");
            }

            setContact({ name: "", email: "", inquiryType: "", message: "" });
            setContactStatus({ type: "success", message: "Thanks — your message has been sent." });
        } catch (error) {
            setContactStatus({
                type: "error",
                message: error.message || "We could not send your message. Please try again.",
            });
        }
    };

    return (
        <main className="baseContainer homePage">
            <section className="homeRegion heroSection" aria-labelledby="heroHeading">
                <div className="heroCopy">
                    <div className="heroCenterpiece">
                        <h1 id="heroHeading">Informatics Undergraduate Association</h1>
                        <p>Events, people, and opportunities across the Informatics community.</p>
                        <nav className="heroActions" aria-label="Homepage shortcuts">
                            <Link className="pill-button homePrimaryLink" to="/events">Explore Events <span aria-hidden="true">→</span></Link>
                        </nav>
                    </div>
                    <nav className="heroCategories" aria-label="Explore events by interest">
                        <Link className="heroCategory heroCategoryCareer" to="/events">Career</Link>
                        <Link className="heroCategory heroCategoryAcademic" to="/events">Academic</Link>
                        <Link className="heroCategory heroCategorySocial" to="/events">Social</Link>
                    </nav>
                </div>
                <div className="heroWorld" aria-label="IUGA student community">
                    <img className="heroPhoto heroPhotoMain" src={formalImage} alt="IUGA members at iFormal 2026" />
                    <img className="heroPhoto heroPhotoTop" src={heart} alt="IUGA members forming a heart" />
                    <img className="heroPhoto heroPhotoBottom" src={bowling} alt="IUGA bowling night" />
                    <div className="collageGlassCard">
                        <span className="collageGlassEyebrow">Happening this week</span>
                        <strong className="collageGlassTitle">{featuredEventName}</strong>
                        <span className="collageGlassMeta">{featuredEventDate}</span>
                        <div className="collageGlassPeople" aria-label="Students are part of the IUGA community">
                            <img src={groups} alt="" />
                            <img src={officers} alt="" />
                            <img src={panelists} alt="" />
                            <span>Students welcome</span>
                        </div>
                        <Link className="collageGlassLink" to="/events">View event <span aria-hidden="true">→</span></Link>
                    </div>
                    <Link className="heroJoin glassObject" to="/get-involved">
                        <span className="glassObjectKicker"><span aria-hidden="true">●</span> Get involved</span>
                        <strong>Join IUGA</strong>
                        <span>Help build what's next. <b aria-hidden="true">→</b></span>
                    </Link>
                    <Link className="heroMerch glassObject" to="/shop">
                        <img src={merch} alt="IUGA branded merchandise arranged for students" />
                        <span><strong>Rep Informatics</strong><br />Shop merch <b aria-hidden="true">→</b></span>
                    </Link>
                </div>
            </section>

            <section className="contactUsCard" aria-labelledby="contact-title">
                <div className="contactUsCard__content">
                    <p className="homeEyebrow">Contact us</p>
                    <h2 id="contact-title">Get in touch</h2>
                    <p>
                        Questions, partnership ideas, or feedback for IUGA? We would love to hear from students,
                        faculty, and the wider iSchool community.
                    </p>
                    <a className="contactUsCard__email" href="mailto:iuga@uw.edu">iuga@uw.edu</a>

                    <form className="contactUsCard__form" onSubmit={sendContactMessage}>
                        <input className="contactUsCard__honeypot" name="website" tabIndex="-1" autoComplete="off" aria-hidden="true" />
                        <div className="contactUsCard__formRow">
                            <label>
                                Name
                                <input name="name" value={contact.name} onChange={updateContactField} autoComplete="name" required />
                            </label>
                            <label>
                                Inquiry type
                                <select name="inquiryType" value={contact.inquiryType} onChange={updateContactField} required>
                                    <option value="" disabled>Select one</option>
                                    <option value="Student">Student</option>
                                    <option value="Faculty">Faculty</option>
                                    <option value="Professional">Professional</option>
                                    <option value="Other">Other</option>
                                </select>
                            </label>
                        </div>
                        <label>
                            Email
                            <input name="email" type="email" value={contact.email} onChange={updateContactField} autoComplete="email" required />
                        </label>
                        <label>
                            Your message
                            <textarea name="message" value={contact.message} onChange={updateContactField} rows="4" required />
                        </label>
                        <button className="pill-button homePrimaryLink" type="submit" disabled={contactStatus.type === "submitting"}>
                            {contactStatus.type === "submitting" ? "Sending…" : "Send message"} <span aria-hidden="true">→</span>
                        </button>
                        {contactStatus.type !== "idle" && contactStatus.type !== "submitting" && (
                            <p className={`contactUsCard__formStatus contactUsCard__formStatus--${contactStatus.type}`} role="status">
                                {contactStatus.message}
                            </p>
                        )}
                    </form>
                </div>
            </section>
        </main>
    );
}

export default HomePage;
