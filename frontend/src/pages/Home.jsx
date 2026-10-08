import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDays } from "@fortawesome/free-solid-svg-icons";
import heart from "../assets/gallery/heart.jpeg";
import gameNight from "../assets/gallery/gamenight.jpg";
import merch from "../assets/gallery/merch.jpeg";

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

const eventMonthFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    timeZone: "America/Los_Angeles",
});
const eventDayFormatter = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    timeZone: "America/Los_Angeles",
});
const eventTimeFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
});

function getUpcomingHomeEvents(upcomingEvents) {
    const now = Date.now();
    return (Array.isArray(upcomingEvents) ? upcomingEvents : [])
        .map((event) => ({ event, start: Date.parse(event?.eStartDate) }))
        .filter(({ start }) => Number.isFinite(start) && start > now)
        .sort((first, second) => first.start - second.start)
        .slice(0, 3)
        .map(({ event }) => event);
}

function UpcomingEvents({ events }) {
    return (
        <section className="homeEvents" aria-labelledby="homeUpcomingEventsHeading">
            <div className="homeEventsHeader">
                <h2 id="homeUpcomingEventsHeading">Upcoming events</h2>
            </div>
            {events.length > 0 ? (
                <ul className="homeEventList">
                    {events.map((event) => {
                        const start = new Date(event.eStartDate);
                        return (
                            <li key={`${event.eName}-${event.eStartDate}`}>
                                <Link className="homeEventLink" to="/events">
                                    <time className="homeEventDate" dateTime={event.eStartDate}>
                                        <span>{eventMonthFormatter.format(start)}</span>
                                        <strong>{eventDayFormatter.format(start)}</strong>
                                    </time>
                                    <div className="homeEventDetails">
                                        <h3>{event.eName}</h3>
                                        <p>{eventTimeFormatter.format(start)} Pacific</p>
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <Link className="homeEmptyEventCard" to="/events">
                    <span className="homeEventIcon" aria-hidden="true">
                        <FontAwesomeIcon icon={faCalendarDays} />
                    </span>
                    <div>
                        <h3>New dates are on the way.</h3>
                        <p>Check the calendar for the next IUGA gathering.</p>
                    </div>
                </Link>
            )}
        </section>
    );
}

function HomePage({ upcomingEvents = [] }) {
    const { pathname } = useLocation();
    const events = getUpcomingHomeEvents(upcomingEvents);

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

                <UpcomingEvents events={events} />
            </div>

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
