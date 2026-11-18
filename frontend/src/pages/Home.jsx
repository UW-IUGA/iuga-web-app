import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { mockCalendarData } from "../assets/mock-data/MockCalendarData";
import { mockUpcomingEvents } from "../assets/mock-data/MockUpcomingEvents";
import { isProduction } from "../runtime";
import heart from "../assets/gallery/heart.jpeg";
import gates from "../assets/gallery/mary_gates.jpg";
import gameNight from "../assets/gallery/gamenight.jpg";
import merch from "../assets/gallery/merch.jpeg";
import EventAgenda from "../components/EventAgenda";

const DEV_EVENTS = [...mockCalendarData, ...mockUpcomingEvents];

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
        label: "Merch",
        description: "Shop here to get the newest Informatics merch!",
        to: "/shop",
    },
    {
        label: "About IUGA",
        description: "Meet the students and teams behind IUGA.",
        to: "/about",
    },
];

const DESTINATION_PHOTOS = [gameNight, merch, gates, heart];

const DESTINATION_PREVIEWS = [
    {
        detail: "Find clubs and communities across the iSchool, from design to data to gaming.",
        cta: "Browse organizations",
    },
    {
        detail: "Advising, career help, and well-being support, all in one place.",
        cta: "View resources",
    },
    {
        detail: "Stay updated with the newest Informatics merch drops here.",
        cta: "Shop",
    },
    {
        detail: "Meet the students and teams behind IUGA and see how we work.",
        cta: "Meet the team",
    },
];

function ExploreSelector() {
    const [active, setActive] = useState(0);

    const items = INFORMATICS_DESTINATIONS.map((destination, i) => ({
        ...destination,
        image: DESTINATION_PHOTOS[i],
        ...DESTINATION_PREVIEWS[i],
    }));

    const current = items[active];

    return (
        <section className="homeExplore" aria-labelledby="homeExploreHeading">
            <div className="homeSectionHeading">
                <p className="homeEyebrow">DISCOVER YOUR COMMUNITY</p>
                <h2 id="homeExploreHeading">
                    Explore <span>Informatics.</span>
                </h2>
                <p className="homeSummary">
                    Everything you need to make the most of your
                    Informatics experience.
                </p>
            </div>

            <div className="homeDestinations">
                <ul className="homeDestinationList">
                    {items.map((item, i) => (
                        <li key={item.to}>
                            <button
                                type="button"
                                className={
                                    i === active
                                        ? "homeDestination active"
                                        : "homeDestination"
                                }
                                aria-pressed={i === active}
                                onMouseEnter={() => setActive(i)}
                                onFocus={() => setActive(i)}
                                onClick={() => setActive(i)}
                            >
                                <img src={item.image} alt="" loading="lazy" />
                                <span className="homeDestinationText">
                                    <strong>{item.label}</strong>
                                    <span>{item.description}</span>
                                </span>
                                <span className="homeDestinationArrow" aria-hidden="true">
                                    ›
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>

                <article className="homePreview" aria-live="polite">
                    <div className="homePreviewPhoto">
                        <img key={active} src={current.image} alt="" />
                    </div>
                    <div className="homePreviewBody">
                        <h3>{current.label}</h3>
                        <p>{current.detail}</p>
                        <Link to={current.to}>
                            {current.cta}
                            <span aria-hidden="true">↗</span>
                        </Link>
                    </div>
                </article>
            </div>
        </section>
    );
}

function HomePage() {
    const { pathname } = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    const [calendarEvents, setCalendarEvents] = useState([]);

    const [eventsStatus, setEventsStatus] = useState("loading");

    const [eventsRequest, setEventsRequest] = useState(0);

    useEffect(() => {
        let isCurrent = true;

        if (!isProduction) {
            setCalendarEvents(DEV_EVENTS);
            setEventsStatus("ready");
        } else {
            setEventsStatus("loading");

            fetch("/api/v1/events/", { method: "GET" })
                .then((res) => {
                    if (!res.ok) throw new Error("Unable to fetch events");
                    return res.json();
                })
                .then((events) => {
                    if (!isCurrent) return;
                    setCalendarEvents(events);
                    setEventsStatus("ready");
                })
                .catch((error) => {
                    console.error("Unable to load home events", error);
                    if (isCurrent) setEventsStatus("failed");
                });
        }

        return () => {
            isCurrent = false;
        };
    }, [eventsRequest]);

    return (
        <main className="baseContainer homePage">
            <header className="homeOpening">
                <img
                    className="homeHeartPhoto"
                    src={heart}
                    alt="Informatics students forming a heart under the Quad cherry blossoms"
                />
                <div className="homeIntro">
                    <p className="homeAffiliation">University of Washington / Information School</p>
                    <h1>Find your place in Informatics.</h1>
                    <p className="homeSummary">
                        IUGA is the undergraduate student government for UW Informatics. Find your community, support, and a say in what happens next.
                    </p>
                    <nav className="homeActions" aria-label="Homepage shortcuts">
                        <Link className="pill-button homePrimaryLink" to="/events">Explore events</Link>
                        <Link className="pill-button homeSecondaryLink" to="/get-involved">Get involved <span aria-hidden="true">↗</span></Link>
                    </nav>
                </div>
                <div className="homeHeroPhotos">
                    <img src={gameNight} alt="Students playing video games at an IUGA game night" />
                    <img src={merch} alt="Students wearing Informatics sweatshirts on campus" />
                </div>
            </header>

            <section className="homeCalendarSection">
                <EventAgenda
                    events={calendarEvents}
                    status={eventsStatus}
                    onRetry={() => setEventsRequest((request) => request + 1)}
                    featuredCount={2}
                    onSelectEvent={() => navigate("/events")}
                />
            </section>

            <ExploreSelector />
        </main>
    );
}

export default HomePage;