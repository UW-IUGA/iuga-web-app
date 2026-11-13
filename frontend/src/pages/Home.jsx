import { useEffect, useState } from "react";
import { mockCalendarData } from "../assets/mock-data/MockCalendarData";
import { mockUpcomingEvents } from "../assets/mock-data/MockUpcomingEvents";
import { isProduction } from "../runtime";
import { Link, useLocation } from "react-router-dom";
import heart from "../assets/gallery/heart.jpeg";
import gates from "../assets/gallery/mary_gates.jpg";
import gameNight from "../assets/gallery/gamenight.jpg";
import merch from "../assets/gallery/merch.jpeg";
import EventAgenda from "../components/EventAgenda";
import "./HomePrototypes.css";

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

// Switcher options. Delete this list, the switcher, and the variants you don't want once you pick one.
const VARIANTS = [
    { id: "current", label: "Current" },
    { id: "one", label: "1 · Collage" },
    { id: "two", label: "2 · Photo hero" },
    { id: "three", label: "3 · Bold" },
    { id: "four", label: "4 · Community Hub" },
];

// One photo per carousel slide, in the same order as INFORMATICS_DESTINATIONS.
// You only have three gallery photos right now, so the last slide reuses the heart photo.
// Swap in a dedicated photo for each destination when you have them.
const CAROUSEL_PHOTOS = [heart, gameNight, merch, heart];

// ============================================================
// STEP 1: Add these constants near CAROUSEL_PHOTOS in HomePage.jsx
// ============================================================

// One photo per destination, in the same order as INFORMATICS_DESTINATIONS.
// Swap in dedicated photos when you have them.
const SELECTOR_PHOTOS = [gameNight, merch, gates, heart];

// Extra copy for the preview card, same order as INFORMATICS_DESTINATIONS.
const SELECTOR_COPY = [
    {
        detail: "Find clubs and communities across the iSchool, from design to data to gaming.",
        cta: "Browse organizations",
    },
    {
        detail: "Advising, career help, and well-being support, all in one place.",
        cta: "View resources",
    },
    {
        detail: "Tell IUGA what matters to you. Your feedback shapes our advocacy.",
        cta: "Share feedback",
    },
    {
        detail: "Meet the students and teams behind IUGA and see how we work.",
        cta: "Meet the team",
    },
];

// Prototype 2: auto-advancing carousel (pauses on hover/focus and for reduced-motion visitors)

function ExploreCarousel() {
    const [index, setIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    const count = INFORMATICS_DESTINATIONS.length;
    const slideDuration = 4000;

    const slides = INFORMATICS_DESTINATIONS.map((destination, i) => ({
        ...destination,
        image: CAROUSEL_PHOTOS[i],
    }));

    useEffect(() => {
        if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
        }

        const timer = setInterval(() => {
            setIndex((current) => (current + 1) % count);
        }, slideDuration);

        return () => clearInterval(timer);
    }, [paused, count, index]);

    const goToSlide = (newIndex) => {
        setIndex((newIndex + count) % count);
    };

    return (
        <section
            className="protoCarousel protoCarouselRedesign"
            aria-labelledby="protoCarouselHeading"
            aria-roledescription="carousel"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setPaused(false);
                }
            }}
        >
            <div className="protoCarouselHeader">
                <div>
                    <p className="protoCarouselEyebrow">
                        DISCOVER YOUR COMMUNITY
                    </p>
                    <h2 id="protoCarouselHeading">
                        Explore <span>Informatics.</span>
                    </h2>
                </div>
                <p className="protoCarouselIntro">
                    Everything you need to make the most of your
                    Informatics experience.
                </p>
            </div>

            <div className="protoCarouselView">
                <div
                    className="protoCarouselTrack"
                    style={{
                        transform: `translateX(-${index * 100}%)`
                    }}
                >
                    {slides.map((slide, i) => (
                        <div
                            className="protoSlide"
                            key={slide.to}
                            aria-hidden={i !== index}
                            inert={i !== index}
                        >
                            <img
                                src={slide.image}
                                alt=""
                                loading={i === 0 ? "eager" : "lazy"}
                            />

                            <div className="protoSlideOverlay" />

                            <div className="protoSlideCaption">
                                <span className="protoSlideNumber">
                                    {String(i + 1).padStart(2, "0")}
                                    {" / "}
                                    {String(count).padStart(2, "0")}
                                </span>

                                <h3>{slide.label}</h3>
                                <p>{slide.description}</p>

                                <Link
                                    to={slide.to}
                                    className="protoSlideLink"
                                    tabIndex={i === index ? 0 : -1}
                                >
                                    Explore more
                                    <span aria-hidden="true">↗</span>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="protoCarouselArrows">
                    <button
                        type="button"
                        aria-label="Previous slide"
                        onClick={() => goToSlide(index - 1)}
                    >
                        ←
                    </button>
                    <button
                        type="button"
                        aria-label="Next slide"
                        onClick={() => goToSlide(index + 1)}
                    >
                        →
                    </button>
                </div>
            </div>

            <div
                className="protoCarouselProgress"
                aria-label="Choose carousel slide"
            >
                {slides.map((slide, i) => (
                    <button
                        key={slide.to}
                        type="button"
                        className={
                            i === index
                                ? "protoProgressDot active"
                                : "protoProgressDot"
                        }
                        aria-label={`Show ${slide.label}`}
                        aria-current={i === index ? "true" : undefined}
                        onClick={() => goToSlide(i)}
                    >
                        <span />
                    </button>
                ))}
            </div>
        </section>
    );
}

// ============================================================
// STEP 2: Add this component right after ExploreCarousel
// (you can delete ExploreCarousel once you've picked this layout)
// ============================================================

// Prototype 2: pick a destination on the left, see a preview on the right
function ExploreSelector() {
    const [active, setActive] = useState(0);

    const items = INFORMATICS_DESTINATIONS.map((destination, i) => ({
        ...destination,
        image: SELECTOR_PHOTOS[i],
        ...SELECTOR_COPY[i],
    }));

    const current = items[active];

    return (
        <section
            className="protoSelector"
            aria-labelledby="protoSelectorHeading"
        >
            <div className="protoSelectorHeader">
                <p className="protoSelectorEyebrow">DISCOVER YOUR COMMUNITY</p>
                <h2 id="protoSelectorHeading">
                    Explore <span>Informatics.</span>
                </h2>
                <p className="protoSelectorIntro homeSummary">
                    Everything you need to make the most of your
                    Informatics experience.
                </p>
            </div>

            <div className="protoSelectorGrid">
                <ul className="protoSelectorList">
                    {items.map((item, i) => (
                        <li key={item.to}>
                            <button
                                type="button"
                                className={
                                    i === active
                                        ? "protoSelectorRow active"
                                        : "protoSelectorRow"
                                }
                                aria-pressed={i === active}
                                onMouseEnter={() => setActive(i)}
                                onFocus={() => setActive(i)}
                                onClick={() => setActive(i)}
                            >
                                <img
                                    className="protoSelectorThumb"
                                    src={item.image}
                                    alt=""
                                    loading="lazy"
                                />
                                <span className="protoSelectorText">
                                    <span className="protoSelectorTitle">
                                        {item.label}
                                    </span>
                                    <span className="protoSelectorDesc">
                                        {item.description}
                                    </span>
                                </span>
                                <span
                                    className="protoSelectorChevron"
                                    aria-hidden="true"
                                >
                                    ›
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>

                <article className="protoSelectorCard" aria-live="polite">
                    <div className="protoSelectorPhoto">
                        <img key={active} src={current.image} alt="" />
                    </div>
                    <div className="protoSelectorBody">
                        <h3>{current.label}</h3>
                        <p>{current.detail}</p>
                        <Link to={current.to} className="protoSelectorButton">
                            {current.cta}
                            <span aria-hidden="true">↗</span>
                        </Link>
                    </div>
                </article>
            </div>
        </section>
    );
}

function HomePage({ upcomingEvents = [] }) {
    const { pathname } = useLocation();

    // Which layout is showing (prototype switcher)
    const [variant, setVariant] = useState(() => {
        const selected = new URLSearchParams(window.location.search).get("prototype");
        return VARIANTS.some((option) => option.id === selected) ? selected : "current";
    });

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    const [calendarEvents, setCalendarEvents] = useState([]);

    // Tracks whether events are loading, ready, or failed
    const [eventsStatus, setEventsStatus] = useState("loading");

    // Allows retrying if the backend request fails
    const [eventsRequest, setEventsRequest] = useState(0);

    useEffect(() => {
        let isCurrent = true;

        if (!isProduction) {
            // Use mock event data during development
            setCalendarEvents(DEV_EVENTS);
            setEventsStatus("ready");
        } else {
            // Retrieve real event data from the backend
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

    // ---------- Shared: the events section is the same in every layout ----------
    const calendar = (
        <section className="homeCalendarSection">
            <EventAgenda
                events={calendarEvents}
                status={eventsStatus}
                onRetry={() => setEventsRequest((request) => request + 1)}
                homeMode
            />
        </section>
    );

    // ---------- Current layout (unchanged) ----------
    const currentTop = (
        <div className="homeOpening">
            <header className="homeIntro">
                <p className="homeAffiliation">University of Washington / Information School</p>
                <h1>Find your place in Informatics.</h1>
                <p className="homeSummary">
                    IUGA is the undergraduate student government for UW Informatics. Find your community, support, and a say in what happens next.
                </p>
                <nav className="homeActions" aria-label="Homepage shortcuts">
                    <Link className="pill-button homePrimaryLink" to="/events">Explore events</Link>
                    <Link className="pill-button homeSecondaryLink" to="/get-involved">Get involved <span aria-hidden="true">↗</span></Link>
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
    );

    const currentExplore = (
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
    );

    const currentCommunity = (
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
    );

    // ---------- Prototype 1: sticker collage ----------
    const oneTop = (
        <header className="protoOneHero">
            <div>
                <p className="homeAffiliation">University of Washington / Information School</p>
                <h1>
                    Find your <span className="protoAccent">place</span> in Informatics.
                </h1>
                <p className="homeSummary">
                    IUGA is the undergraduate student government for UW Informatics. Find your community, support, and a say in what happens next.
                </p>
                <nav className="homeActions" aria-label="Homepage shortcuts">
                    <Link className="pill-button homePrimaryLink" to="/shop">Shop</Link>
                    <Link className="pill-button homeSecondaryLink" to="/get-involved">Get involved <span aria-hidden="true">↗</span></Link>
                </nav>
            </div>
            <div className="protoCollage">
                <div className="protoPhoto protoCollageLeft">
                    <img src={gameNight} alt="Students playing video games at an IUGA game night" />
                </div>
                <div className="protoPhoto protoCollageMain">
                    <img src={heart} alt="Informatics students forming a heart under the Quad cherry blossoms" />
                </div>
                <div className="protoPhoto protoCollageRight">
                    <img src={merch} alt="Students wearing Informatics sweatshirts on campus" />
                </div>
            </div>
        </header>
    );

    const oneExplore = (
        <section className="protoOneExplore" aria-labelledby="protoOneExploreHeading">
            <h2 id="protoOneExploreHeading">Explore Informatics</h2>
            <p>Find your people, get support, and make your voice heard.</p>
            <nav className="protoTiles" aria-label="Informatics support and community">
                {INFORMATICS_DESTINATIONS.map((destination) => (
                    <Link className="protoTile" to={destination.to} key={destination.to}>
                        <h3>{destination.label}</h3>
                        <p>{destination.description}</p>
                        </Link>
                ))}
            </nav>
        </section>
    );

    // ---------- Prototype 2: full-bleed photo panel + carousel ----------
    const twoTop = (
        <header className="protoTwoHero protoHeroPhoto">
            <img className="protoHeroBg" src={heart} alt="Informatics students forming a heart under the Quad cherry blossoms" />
            <div className="protoHeroText">
                <p className="homeAffiliation">University of Washington / Information School</p>
                <h1>
                    Find your <span className="protoAccent">place</span> in Informatics.
                </h1>
                <p className="homeSummary">
                    IUGA is the undergraduate student government for UW Informatics. Find your community, support, and a say in what happens next.
                </p>
                <nav className="homeActions" aria-label="Homepage shortcuts">
                    <Link className="pill-button homePrimaryLink" to="/events">Explore events</Link>
                    <Link className="pill-button homeSecondaryLink" to="/get-involved">Get involved <span aria-hidden="true">↗</span></Link>
                </nav>
            </div>
            <div className="protoHeroCards">
                <img src={gameNight} alt="Students playing video games at an IUGA game night" />
                <img src={merch} alt="Students wearing Informatics sweatshirts on campus" />
            </div>
        </header>
    );

    // ---------- Prototype 3: bold editorial ----------
    const threeTop = (
        <header className="protoThreeHero protoHeroPhoto">
            <img className="protoHeroBg" src={gates} alt="Informatics students forming a heart under the Quad cherry blossoms" />
            <div className="protoHeroText">
                <p className="homeAffiliation">University of Washington / Information School</p>
                <h1>
                    Find your <span className="protoAccent">place</span> in Informatics.
                </h1>
                <p className="homeSummary">
                    IUGA is the undergraduate student government for UW Informatics. Find your community, support, and a say in what happens next.
                </p>
                <nav className="homeActions" aria-label="Homepage shortcuts">
                    <Link className="pill-button homePrimaryLink" to="/get-involved">Get involved <span aria-hidden="true">↗</span></Link>
                    <Link className="pill-button homeSecondaryLink" to="/shop">Shop</Link>
                </nav>
            </div>
        </header>
    );

    const threeExplore = (
        <section className="protoThreeExplore" aria-labelledby="protoThreeExploreHeading">
            <h2 id="protoThreeExploreHeading">Explore Informatics</h2>
            <nav className="protoRows" aria-label="Informatics support and community">
                {INFORMATICS_DESTINATIONS.map((destination) => (
                    <Link to={destination.to} key={destination.to}>
                        <h3>{destination.label}</h3>
                        <span>{destination.description}</span>
                    </Link>
                ))}
            </nav>
        </section>
    );

    // ---------- Prototype 4: interactive community hub ----------
    const fourTop = (
        <header className="protoFourHero">
            <div className="protoFourIntro">
                <p className="homeAffiliation">University of Washington / Information School</p>
                <span className="protoFourEyebrow">YOUR COMMUNITY STARTS HERE</span>
                <h1>Your Informatics journey starts <span className="protoFourAccent">here.</span></h1>
                <p className="protoFourSummary">
                    Find your people, discover opportunities, and make your voice heard at UW.
                    IUGA connects Informatics students with community, resources, and experiences.
                </p>
                <nav className="protoFourActions" aria-label="Homepage shortcuts">
                    <Link className="protoFourButton protoFourPrimary" to="/events">Explore events <span aria-hidden="true">↗</span></Link>

                    <Link className="protoFourButton protoFourSecondary" to="/get-involved">Get involved <span aria-hidden="true">↗</span></Link>
                </nav>
            </div>
            <nav className="protoFourGrid" aria-label="Explore the IUGA community">

            {/* Community card */}
            <Link
                className="protoFourCard protoFourTextCard protoFourCommunity"
                to="/resources?category=Community"
            >
                <span className="protoFourCardIcon" aria-hidden="true">✳</span>

                <div className="protoFourCardContent">
                    <span className="protoFourCardLabel">COMMUNITY</span>
                    <h2>Find your people</h2>
                    <p>Connect with students and organizations across Informatics.</p>
                    <span className="protoFourCardArrow" aria-hidden="true">↗</span>
                </div>
            </Link>

            {/* Events card */}
            <Link
                className="protoFourCard protoFourTextCard protoFourEvents"
                to="/events"
            >
                <span className="protoFourCardIcon" aria-hidden="true">◇</span>

                <div className="protoFourCardContent">
                    <span className="protoFourCardLabel">EVENTS</span>
                    <h2>What's happening?</h2>
                    <p>Discover events, meet new people, and get involved.</p>
                    <span className="protoFourCardArrow" aria-hidden="true">↗</span>
                </div>
            </Link>
                <Link className="protoFourCard protoFourTextCard" to="/student-voice">
                    <span className="protoFourCardIcon" aria-hidden="true">✳</span>
                    <div className="protoFourCardContent">
                        <span className="protoFourCardLabel">STUDENT VOICE</span>
                        <h2>Make an impact</h2>
                        <p>Your ideas help shape our community.</p>
                        <span className="protoFourCardArrow" aria-hidden="true">↗</span>
                    </div>
                </Link>
                <Link className="protoFourCard protoFourTextCard protoFourResources" to="/resources">
                    <span className="protoFourCardIcon" aria-hidden="true">✦</span>
                    <div className="protoFourCardContent">
                        <span className="protoFourCardLabel">RESOURCES</span>
                        <h2>Find support</h2>
                        <p>Academic, career, and student resources.</p>
                        <span className="protoFourCardArrow" aria-hidden="true">↗</span>
                    </div>
                </Link>
            </nav>
        </header>
    );

    return (
        <main className={`baseContainer homePage protoPage proto-${variant}`}>
            {/* Prototype switcher: floats at the bottom of the screen. Remove when you've picked a layout. */}
            <div className="protoSwitch" role="group" aria-label="Homepage prototypes">
                {VARIANTS.map((option) => (
                    <button
                        type="button"
                        key={option.id}
                        aria-pressed={variant === option.id}
                        onClick={() => {
                            setVariant(option.id);
                            const url = new URL(window.location.href);
                            url.searchParams.set("prototype", option.id);
                            window.history.replaceState({}, "", url);
                            window.scrollTo(0, 0);
                        }}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {variant === "current" && (
                <>
                    {currentTop}
                    {calendar}
                    {currentExplore}
                    {currentCommunity}
                </>
            )}

            {variant === "one" && (
                <>
                    {oneTop}
                    {calendar}
                    {oneExplore}
                </>
            )}

            {variant === "two" && (
                <>
                    {twoTop}
                    {calendar}
                    <ExploreCarousel />
                    <ExploreSelector />
                </>
            )}

            {variant === "three" && (
                <>
                    {threeTop}
                    {calendar}
                    {threeExplore}
                </>
            )}

            {variant === "four" && (
                <>
                    {fourTop}
                    {calendar}
                </>
            )}
                    </main>
    );
}

export default HomePage;
