import CharacterCard from "../components/CharacterCard";
import EventCard from "../components/EventCard";

function HomePage() {
    const categories = ["Academic", "Social", "Career"];
    const events = [
        {
            "title": "Networking + Industry Panel",
            "organizer": "UX@UW and HCDEsa",
            "short_description": "Eager to learn more about how to get your foot in the door with big tech companies fo...",
            "categories": ["Academic", "Career"]
        },
        {
            "title": "Networking + Industry Panel",
            "organizer": "UX@UW and HCDEsa",
            "short_description": "Eager to learn more about how to get your foot in the door with big tech companies fo...",
            "categories": ["Social", "Career"]
        },
        {
            "title": "Networking + Industry Panel",
            "organizer": "UX@UW and HCDEsa",
            "short_description": "Eager to learn more about how to get your foot in the door with big tech companies fo...",
            "categories": ["Academic"]
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
                <div className="upcomingEventsContainer">
                    { events.slice(0, 3).map(event => {
                        return <EventCard key={event.title} event={event} />;
                    })}
                </div>
            </div>
        </div>
    )
}
  
export default HomePage;
  