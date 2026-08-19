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

function HomePage({ upcomingEvents }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const now = useMemo(() => Date.now(), []);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return (
        <main className="baseContainer homePage">
            <section className="homeRegion heroSection" aria-labelledby="heroHeading">
                <div className="heroCopy">
                    <p className="homeEyebrow">IUGA · Informatics Undergraduate Association</p>
                    <h1 id="heroHeading">Find your place in Informatics.</h1>
                    <p>
                        A student-run community for learning together, showing up for each other,
                        and finding your next way into Informatics.
                    </p>
                    <nav className="heroActions" aria-label="Homepage shortcuts">
                        <Link className="pill-button homePrimaryLink" to="/events">Find an Event</Link>
                    </nav>
                    <nav className="heroPaths" aria-label="Explore the Informatics community">
                        <a className="glassPath" href="#community">
                            <span className="glassPathLabel">Explore Community</span>
                            <span className="glassPathHint">People &amp; organizations</span>
                            <span className="glassPathArrow" aria-hidden="true">→</span>
                        </a>
                        <Link className="glassPath" to="/get-involved">
                            <span className="glassPathLabel">Join IUGA</span>
                            <span className="glassPathHint">Committees &amp; leadership</span>
                            <span className="glassPathArrow" aria-hidden="true">→</span>
                        </Link>
                        <a className="glassPath" href="#merch">
                            <span className="glassPathLabel">Shop Merch</span>
                            <span className="glassPathHint">Rep Informatics</span>
                            <span className="glassPathArrow" aria-hidden="true">→</span>
                        </a>
                    </nav>
                </div>
                <div className="heroCollage">
                    <img className="collageAnchor" src={formalImage} alt="IUGA members at iFormal 2026" />
                    <img className="collageTile collageTileTop" src={heart} alt="IUGA members forming a heart" />
                    <img className="collageTile collageTileBottom" src={bowling} alt="IUGA bowling night" />
                    <p className="collageGlassCard" role="note">
                        <span className="collageGlassEyebrow">For Informatics students</span>
                        <span className="collageGlassTitle">Informatics Undergraduate Association</span>
                        <span className="collageGlassMeta">UW · Seattle</span>
                    </p>
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
                        <article className="functionGroup" key={fn.category}>
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
