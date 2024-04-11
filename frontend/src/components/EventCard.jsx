import Tag from "../components/Tag";

const EventCard = ({ event, decorate }) => {
    return (
        <div className="eventCard">
            { decorate ? <img src="/assets/events-decoration.svg" /> : "" }
            <div>
                <img src={``} alt={`${event.title} event`} ></img>
            </div>
            <div className="eventCardHeader">
                <h1>{event.title}</h1>
                <p>{event.organizer}</p>
            </div>
            <div className="eventCardBody">
                <p>{event.short_description}</p>
            </div>
            <div className="eventCardCategories">
                { event.categories.map(category => {
                    return <Tag key={category} text={category} style={category} />;
                })}
            </div>
    </div>
    );
};

export default EventCard;