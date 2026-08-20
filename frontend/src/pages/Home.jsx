import { useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import EventStream from "../components/EventStream";
import formalImage from "../assets/iFormal-2026.jpeg";
import bowling from "../assets/gallery/bowling.jpeg";
import gamenight from "../assets/gallery/gamenight.jpg";
import groups from "../assets/gallery/groups.jpg";
import heart from "../assets/gallery/heart.jpeg";
import officers from "../assets/gallery/officers-22.png";
import panelists from "../assets/gallery/panelists.jpg";
import merch from "../assets/gallery/merch.jpeg";

const FUNCTIONS = [
    {
        category: "Academic",
        title: "Learn together, grow together",
        body: "Workshops, info sessions, and study jams that help you get more out of the iSchool — with people who are figuring it out right alongside you.",
    },
    {
        category: "Social",
        title: "Show up, connect, unwind",
        body: "Game nights, bowling, and mixers where the Informatics community actually gets to know each other. No agenda — just people.",
    },
    {
        category: "Professional",
        title: "Meet the people who make it",
        body: "Industry panels, networking nights, and career prep with the people doing the work you want to do.",
    },
];

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
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const now = useMemo(() => Date.now(), []);
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
                        <h1 id="heroHeading">By informatics<br />students,<br /><span>for informatics<br />students.</span></h1>
                        <p>Events, people, and opportunities across the Informatics community.</p>
                        <nav className="heroActions" aria-label="Homepage shortcuts">
                            <Link className="pill-button homePrimaryLink" to="/events">Explore Events <span aria-hidden="true">→</span></Link>
                        </nav>
                    </div>
                    <nav className="heroCategories" aria-label="Explore events by interest">
                        <a className="heroCategory heroCategoryCareer" href="#events-professional">Career</a>
                        <a className="heroCategory heroCategoryAcademic" href="#events-academic">Academic</a>
                        <a className="heroCategory heroCategorySocial" href="#events-social">Social</a>
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
                    <a className="heroMerch glassObject" href="#merch">
                        <img src={merch} alt="IUGA branded merchandise arranged for students" />
                        <span><strong>Rep Informatics</strong><br />Shop merch <b aria-hidden="true">→</b></span>
                    </a>
                </div>
            </section>

            <section className="homeRegion eventsSection" aria-labelledby="eventsHeading">
                <div className="homeSectionHeader">
                    <p className="homeEyebrow">On the calendar</p>
                    <h2 id="eventsHeading">Happening in Informatics</h2>
                    <p>Find a workshop, gathering, or conversation that fits where you are right now.</p>
                </div>

                <div className="eventStreams">
                    {FUNCTIONS.map((fn) => (
                        <article className="functionGroup" id={`events-${fn.category.toLowerCase()}`} key={fn.category}>
                            <div className="functionCopy">
                                <p className="functionKicker">{fn.category}</p>
                                <h3>{fn.title}</h3>
                                <p>{fn.body}</p>
                            </div>
                            <EventStream category={fn.category} events={upcomingEvents} now={now} />
                        </article>
                    ))}
                </div>

                <div className="viewAllEvents">
                    <Button text="View All Events" className="pill-button" onClick={() => navigate("/events")} />
                </div>
            </section>

            <section className="homeRegion contentRegion communitySection" id="community" aria-labelledby="communityHeading">
                <div className="contentRegionCopy">
                    <p className="homeEyebrow">Find your people</p>
                    <h2 id="communityHeading">Community</h2>
                    <p>
                        Informatics is better with people beside you. IUGA creates low-pressure
                        ways to meet classmates, celebrate together, and make the iSchool feel smaller.
                    </p>
                </div>
                <div className="imageGrid" aria-label="IUGA community photos">
                    <img src={gamenight} alt="IUGA members at a game night" />
                    <img src={groups} alt="IUGA members gathered together" />
                </div>
            </section>

            <section className="homeRegion contentRegion involvementSection" aria-labelledby="involvementHeading">
                <div className="contentRegionCopy">
                    <p className="homeEyebrow">Make it yours</p>
                    <h2 id="involvementHeading">Get Involved</h2>
                    <p>
                        Bring an idea, join a committee, or help shape what the Informatics community
                        does next. There is room for your version of participation.
                    </p>
                    <Link className="pill-button" to="/get-involved">Explore ways to get involved</Link>
                </div>
                <div className="imageGrid" aria-label="IUGA involvement photos">
                    <img src={officers} alt="IUGA officer team members representing Informatics" />
                    <img src={panelists} alt="IUGA industry panelists speaking at an event" />
                </div>
            </section>

            <section className="homeRegion contentRegion merchSection" id="merch" aria-labelledby="merchHeading">
                <div className="contentRegionCopy">
                    <p className="homeEyebrow">Carry the community with you</p>
                    <h2 id="merchHeading">Rep Informatics</h2>
                    <p>
                        Find your place, then rep it. Tees, hoodies, and more — wear the
                        community you're already part of.
                    </p>
                </div>
                <img className="featureImage" src={merch} alt="IUGA branded merchandise arranged for students" />
            </section>
        </main>
    );
}

export default HomePage;
