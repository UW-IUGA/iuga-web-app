import { useNavigate } from "react-router-dom";
import Tag from "../components/Tag";
import dateFormat from "dateformat";

const EventCard = ({ event, decorate }) => {
    const parsedTimestamp = Date.parse(event.eStartDate);
    const navigate = useNavigate();
    return (
        <div className="eventCard" onClick={() => navigate('/events',{state: {"eId": event.eId, "eStartDate": event.eStartDate}})}>
            { decorate ? <img src="/assets/events-decoration.svg" alt="event card decoration" /> : "" }
            <div>
                <img src={event.eThumbnailPath} alt={`${event.eName} event`} ></img>
            </div>
            <div className="eventCardHeader">
                <h1>{event.eName}</h1>
                <p>{dateFormat(new Date(parsedTimestamp), "ddd, mmm dd")} | {event.eOrganizers}</p>
            </div>
            <div className="eventCardBody">
                <p>{event.eDescription}</p>
            </div>
            <div className="eventCardCategories">
                { event.eLabels.map(category => {
                    return <Tag key={category} text={category} type={category} />;
                })}
            </div>
    </div>
    );
};

export default EventCard;