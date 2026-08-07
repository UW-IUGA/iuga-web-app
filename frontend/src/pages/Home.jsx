import { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../components/Button";
import EventStream from "../components/EventStream";
import ImageCarousel from "../components/ImageCarousel";
import formalImage from "../assets/iFormal-2026.jpeg";
import gamenight from "../assets/gallery/gamenight.png";
import gamenight2 from "../assets/gallery/gamenight-2.png";
import bowling from "../assets/gallery/bowling.jpeg";
import heart from "../assets/gallery/heart.jpeg";
import groups from "../assets/gallery/groups.png";
import officers from "../assets/gallery/officers-22.png";
import panelists from "../assets/gallery/panelists.png";
import merch from "../assets/gallery/merch.jpeg";

// The three IUGA function streams; each stream's event list renders directly
// below its own narrative. Academic and Professional rows read left-to-right;
// Social is reversed.
const FUNCTIONS = [
    {
        category: "Academic",
        title: "Learn together, grow together",
        body: "Workshops, info sessions, and study jams that help you get more out of the iSchool — with people who are figuring it out right alongside you.",
        reversed: false,
        images: [
            { src: groups, alt: "IUGA members together in a group photo" },
            { src: officers, alt: "The IUGA officer team" },
        ],
    },
    {
        category: "Social",
        title: "Show up, connect, unwind",
        body: "Game nights, bowling, and mixers where the Informatics community actually gets to know each other. No agenda — just people.",
        reversed: true,
        images: [
            { src: gamenight, alt: "IUGA members at a game night" },
            { src: gamenight2, alt: "IUGA members playing games together" },
            { src: bowling, alt: "IUGA bowling night" },
            { src: heart, alt: "IUGA members forming a heart" },
        ],
    },
    {
        category: "Professional",
        title: "Meet the people who make it",
        body: "Industry panels, networking nights, and career prep with the people doing the work you want to do.",
        reversed: false,
        images: [
            { src: panelists, alt: "IUGA industry panelists speaking at an event" },
            { src: merch, alt: "IUGA branded merchandise" },
        ],
    },
];

function HomePage({ upcomingEvents }) {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    // One "now" per render so every stream classifies against the same clock.
    const now = useMemo(() => Date.now(), []);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return (
        <div className="baseContainer">
            <section className="heroSection">
                <div className="heroCopy">
                    <h1>Informatics Undergraduate Association</h1>
                    <p>
                        We&apos;re the student-run home for Informatics undergraduates at the
                        University of Washington — a community that learns together, shows up
                        for each other, and opens doors.
                    </p>
                    <Button text="Get Involved" className="standard-button" onClick={() => navigate("/get-involved")} />
                </div>
                <img className="heroImage" src={formalImage} alt="IUGA members at iFormal 2026" />
            </section>

            <section className="functionsSection" aria-labelledby="functionsHeading">
                <div className="homeSectionHeader functionsHeader">
                    <h1 id="functionsHeading">OUR FUNCTIONS</h1>
                </div>
                <p className="functionsIntro">
                    From study sessions to game nights to industry panels, everything IUGA puts
                    on lives in one of three streams — and all of it exists so you can get more
                    out of the iSchool.
                </p>

                {FUNCTIONS.map((fn) => (
                    <div className="functionGroup" key={fn.category}>
                        <div
                            className={`functionRow ${fn.category.toLowerCase()}${fn.reversed ? " functionRowReversed" : ""}`}
                        >
                            <div className="functionCopy">
                                <span className="functionKicker">{fn.category}</span>
                                <h2>{fn.title}</h2>
                                <p>{fn.body}</p>
                            </div>
                            <ImageCarousel images={fn.images} label={`${fn.category} event photos`} />
                        </div>
                        <EventStream category={fn.category} events={upcomingEvents} now={now} />
                    </div>
                ))}

                <div className="viewAllEvents">
                    <Button
                        text="View All Events"
                        className="standard-button"
                        type="right-arrow"
                        onClick={() => navigate("/events")}
                    />
                </div>
            </section>

        </div>
    );
}

export default HomePage;
