import Button from "../components/Button";
import CharacterCard from "../components/CharacterCard";
import EventCard from "../components/EventCard";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useLocation } from 'react-router-dom';
import groups from "../assets/gallery/groups.png";
import bowling from "../assets/gallery/bowling.jpeg";
import merch from "../assets/gallery/merch.jpeg";
import gamenight from "../assets/gallery/gamenight.png";
import panelists from "../assets/gallery/panelists.png";
import heart from "../assets/gallery/heart.jpeg";
import gamenight2 from "../assets/gallery/gamenight-2.png";
import officers22 from "../assets/gallery/officers-22.png";
import careerIcon from "../assets/icons/career-icon.svg";
import socialIcon from "../assets/icons/social-icon.svg";
import academicIcon from "../assets/icons/academic-icon.svg";

function HomePage({upcomingEvents}) {
    const navigate = useNavigate();
    const {pathname} = useLocation();
    const categories = ["Academic", "Social", "Career"];

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return (
        <div className="baseContainer">
            <div className="introduction">
                <h1>Informatics</h1>
                <h1>Undergraduate Association</h1>
                <p>IUGA is a student-led RSO that communicates between the Informatics student body, faculty, and administration of the University of Washington Information School.</p>
                <div className="characterCardContainer">
                    <div className="characterBackground characterBackgroundLeft">
                        <img src={careerIcon} alt="" />
                        <img src={socialIcon} alt="" />
                        <img src={academicIcon} alt="" />
                        <img src={socialIcon} alt="" />
                        <img src={academicIcon} alt="" />
                        <img src={careerIcon} alt="" />
                        <img src={academicIcon} alt="" />
                        <img src={socialIcon} alt="" />
                        <img src={careerIcon} alt="" />
                    </div>
                    { categories.map(category => {
                        return <CharacterCard key={category} category={category} />;
                    })}
                    <div className="characterBackground characterBackgroundRight">
                        <img src={careerIcon} alt="" />
                        <img src={socialIcon} alt="" />
                        <img src={academicIcon} alt="" />
                        <img src={socialIcon} alt="" />
                        <img src={academicIcon} alt="" />
                        <img src={careerIcon} alt="" />
                        <img src={academicIcon} alt="" />
                        <img src={socialIcon} alt="" />
                        <img src={careerIcon} alt="" />
                    </div>
                </div>
            </div>
            <div className="upcomingEvents">
                <h1>Latest Events</h1>
                <div className="upcomingEventsCardContainer">
                    { upcomingEvents.slice(0, 3).map((event, i) => {
                        return <EventCard key={event.eName} event={event} decorate={i === 2 ? true : false }/>;
                    })}
                </div>
                <Button text="More Events" className="primary-button" type="right-arrow" color="black" onClick={() => {navigate("/events")}}/>
            </div>
            <div className="gallery">
                <h1>Gallery</h1>
                <div className="galleryImageContainer">
                    <div><img src={groups} alt="" /></div>
                    <div><img src={bowling} alt="" /></div>
                    <div><img src={merch} alt="" /></div>
                    <div><img src={gamenight} alt="" /></div>
                    <div><img src={panelists} alt="" /></div>
                    <div><img src={heart} alt="" /></div>
                    <div><img src={gamenight2} alt="" /></div>
                    <div><img src={officers22} alt="" /></div>
                </div>
                <div>
                    <img src="/assets/campfire.png" alt="characters around a campfire" />
                </div>
            </div>
        </div>
    )
}

export default HomePage;
