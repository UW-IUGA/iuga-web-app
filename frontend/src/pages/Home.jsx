import { useEffect } from "react";
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
    const featuredEvent = upcomingEvents?.[0];
    const featuredEventName = featuredEvent?.eName || "The next IUGA gathering";
    const featuredEventDate = formatEventDate(featuredEvent?.eStartDate);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

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
                    <Link className="heroMerch glassObject" to="/get-involved">
                        <img src={merch} alt="IUGA branded merchandise arranged for students" />
                        <span><strong>Rep Informatics</strong><br />Shop merch <b aria-hidden="true">→</b></span>
                    </Link>
                </div>
            </section>
        </main>
    );
}

export default HomePage;
