import Button from "../components/Button";
import CharacterCard from "../components/CharacterCard";
import EventCard from "../components/EventCard";
import { useNavigate } from "react-router-dom";

function HomePage() {
    const navigate = useNavigate();
    const categories = ["Academic", "Social", "Career"];
    const events = [
        {
            "title": "Networking + Industry Panel",
            "organizer": "UX@UW and HCDEsa",
            "short_description": "Eager to learn more about how to get your foot in the door with big tech companies fo...",
            "categories": ["Social", "Career"]
        },
        {
            "title": "Hack for Social Good 2024",
            "organizer": "IUGA, Winfo, binfo",
            "short_description": "Eager to learn more about how to get your foot in the door with big tech companies fo...",
            "categories": ["Social", "Academic", "Career"]
        },
        {
            "title": "Coffee & Coloring",
            "organizer": "IUGA",
            "short_description": "Eager to learn more about how to get your foot in the door with big tech companies fo...",
            "categories": ["Social"]
        },
        {
            "title": "Networking + Industry Panel",
            "organizer": "UX@UW and HCDEsa",
            "short_description": "Eager to learn more about how to get your foot in the door with big tech companies fo...",
            "categories": ["Academic", "Social", "Career"]
        }
    ];

    return (
        <div className="baseContainer">
            <div className="introduction">
                <h1>Informatics <br/> Undergraduate Association</h1>
                <p>IUGA is a student-led RSO that communicates between the Informatics student body, faculty, and administration of the University of Washington Information School.</p>
                <div className="characterCardContainer">
                    { categories.map(category => {
                        return <CharacterCard key={category} category={category} />;
                    })}
                </div>
            </div>
            <div className="upcomingEvents">
                <h1>Upcoming Events</h1>
                <div className="upcomingEventsCardContainer">
                    { events.slice(0, 3).map((event, i) => {
                        return <EventCard key={event.title} event={event} decorate={i === 2 ? true : false }/>;
                    })}
                </div>
                <Button text="More Events" style="right-arrow" callback={() => {navigate("/events")}}/>
            </div>
        </div>
    )
}
  
export default HomePage;
  