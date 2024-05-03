import Button from "../components/Button";
import CharacterCard from "../components/CharacterCard";
import EventCard from "../components/EventCard";
import { useNavigate } from "react-router-dom";

function HomePage({upcomingEvents}) {
    const navigate = useNavigate();
    const categories = ["Academic", "Social", "Career"];
    console.log(upcomingEvents)

    return (
        <div className="baseContainer">
            <div className="introduction">
                <h1>Informatics</h1>
                <h1>Undergraduate Association</h1>
                <p>IUGA is a student-led RSO that communicates between the Informatics student body, faculty, and administration of the <span className="uw-purple"><strong>University of Washington</strong></span> Information School.</p>
                <div className="characterCardContainer">
                    { categories.map(category => {
                        return <CharacterCard key={category} category={category} />;
                    })}
                </div>
            </div>
            <div className="upcomingEvents">
                <h1>Latest Events</h1>
                <div className="upcomingEventsCardContainer">
                    { upcomingEvents.slice(0, 3).map((event, i) => {
                        return <EventCard key={event.title} event={event} decorate={i === 2 ? true : false }/>;
                    })}
                </div>
                <Button text="More Events" className="primary-button right-arrow-white" color="black" callback={() => {navigate("/events")}}/>
            </div>
            <div className="gallery">
                <h1>Gallery</h1>
                <div className="galleryImageContainer">
                    <div><img src="/assets/gallery/groups.png" alt="" /></div>
                    <div><img src="/assets/gallery/bowling.jpeg" alt="" /></div>
                    <div><img src="/assets/gallery/merch.jpeg" alt="" /></div>
                    <div><img src="/assets/gallery/gamenight.png" alt="" /></div>
                    <div><img src="/assets/gallery/panelists.png" alt="" /></div>
                    <div><img src="/assets/gallery/heart.jpeg" alt="" /></div>
                    <div><img src="/assets/gallery/gamenight-2.png" alt="" /></div>
                    <div><img src="/assets/gallery/officers-22.png" alt="" /></div>
                </div>
                <div>
                    <img src="/assets/campfire.png" alt="characters around a campfire" />
                </div>
            </div>
        </div>
    )
}
  
export default HomePage;
  