import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays } from "@fortawesome/free-solid-svg-icons";
import heart from "../assets/gallery/heart.jpeg";
import gameNight from "../assets/gallery/gamenight.jpg";
import merch from "../assets/gallery/merch.jpeg";
import EventAgenda from "../components/EventAgenda";

const INFORMATICS_DESTINATIONS = [
    {
        label: "Student organizations",
        description: "Find clubs and communities across the iSchool.",
        to: "/resources?category=Community",
    },
    {
        label: "Resources",
        description: "Academic, career, community, and well-being support.",
        to: "/resources",
    },
    {
        label: "Student Voice",
        description: "Share feedback that informs IUGA advocacy.",
        to: "/student-voice",
    },
    {
        label: "About IUGA",
        description: "Meet the students and teams behind IUGA.",
        to: "/about",
    },
];

function HomePage({ upcomingEvents = [] }) {
    const { pathname } = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return (
        <main className="baseContainer homePage">
            <div className="homeOpening">
                <header className="homeIntro">
                    <p className="homeAffiliation">University of Washington / Information School</p>
                    <h1>Find your place in Informatics.</h1>
                    <p className="homeSummary">
                        IUGA is the undergraduate student government for UW Informatics. Find your community, support, and a say in what happens next.
                    </p>
                    <nav className="homeActions" aria-label="Homepage shortcuts">
                        <Link className="pill-button homePrimaryLink" to="/events">Explore events</Link>
                        <Link className="pill-button homeSecondaryLink" to="/get-involved">Get involved</Link>
                    </nav>
                </header>

                <div className="homeHeroPhotoSlot">
                    <div className="homeHeroPhotos">
                        <img
                            className="homeHeartPhoto"
                            src={heart}
                            alt="Informatics students forming a heart under the Quad cherry blossoms"
                            width="1066"
                            height="1600"
                        />
                    </div>
                </div>
            </div>

            <section className="homeCalendarSection">
                <EventAgenda
                    events={upcomingEvents}
                    homeMode={true}
                    onSelectEvent={(event) => {
                        navigate("/events", {
                            state: {
                                eId: event.eId,
                                eStartDate: event.eStartDate,
                            },
                        });
                    }}
                />
            </section>

            <section className="homeExplore" aria-labelledby="homeExploreHeading">
                <div className="homeSectionHeading">
                    <h2 id="homeExploreHeading">Explore Informatics</h2>
                    <p>Find your people, get support, and make your voice heard.</p>
                </div>
                <nav className="homeDestinations" aria-label="Informatics support and community">
                    {INFORMATICS_DESTINATIONS.map((destination) => (
                        <Link className="homeDestination" to={destination.to} key={destination.to}>
                            <h3>{destination.label}</h3>
                            <p>{destination.description}</p>
                        </Link>
                    ))}
                </nav>
            </section>

            <section className="homeCommunity" aria-label="Community links">
                <div className="homeCommunityLinks">
                    <Link className="homeCommunityLink homeInvolvedLink" to="/get-involved" aria-labelledby="homeInvolvedLabel">
                        <div className="homeCommunityPhoto">
                            <img
                                src={gameNight}
                                alt="Students playing video games at an IUGA game night"
                                width="1066"
                                height="1600"
                                loading="lazy"
                            />
                            <div className="homePhotoLabel">
                                <h3 id="homeInvolvedLabel">Get involved</h3>
                            </div>
                        </div>
                    </Link>
                    <Link className="homeCommunityLink homeShopLink" to="/shop" aria-labelledby="homeShopLabel">
                        <div className="homeCommunityPhoto">
                            <img
                                src={merch}
                                alt="Students wearing Informatics sweatshirts on campus"
                                width="1066"
                                height="1600"
                                loading="lazy"
                            />
                            <div className="homePhotoLabel">
                                <h3 id="homeShopLabel">Shop</h3>
                            </div>
                        </div>
                    </Link>
                </div>
            </section>
        </main>
    );
}

export default HomePage;
