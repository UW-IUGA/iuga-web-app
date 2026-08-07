import { useNavigate } from "react-router-dom";
import Tag from "../components/Tag";
import dateFormat from "dateformat";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faGraduationCap, faUsers } from "@fortawesome/free-solid-svg-icons";
import { categoriesFor } from "../utils/eventStreams";

const FALLBACK_ICONS = {
    Academic: faGraduationCap,
    Social: faUsers,
    Professional: faBriefcase,
};

const EventCard = ({ event }) => {
    const parsedTimestamp = Date.parse(event.eStartDate);
    const navigate = useNavigate();
    const categories = categoriesFor(event);
    const fallbackCategory = categories[0] ?? "Academic";
    const hasThumbnail = Boolean(event.eThumbnailPath);
    const openEventDetails = () => {
        navigate('/events', { state: { eId: event.eId, eStartDate: event.eStartDate } });
    };

    // Accessibility: Enter or Space opens the focused card like a native link;
    // Space's default scroll is prevented so it only navigates.
    const handleCardKeyDown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openEventDetails();
        }
    };

    return (
        // role="link" tells screen readers this card is a link; tabIndex={0}
        // brings it into the Tab order so keyboard users can reach it.
        <div className="eventCard" role="link" tabIndex={0} aria-label={`View ${event.eName} event`} onClick={openEventDetails} onKeyDown={handleCardKeyDown}>
            <div>
                {hasThumbnail ? (
                    <img src={event.eThumbnailPath} alt={`${event.eName} event`} />
                ) : (
                    <div
                        className={`eventCardFallback ${fallbackCategory.toLowerCase()}`}
                        aria-hidden="true"
                    >
                        <FontAwesomeIcon icon={FALLBACK_ICONS[fallbackCategory]} />
                    </div>
                )}
            </div>
            <div className="eventCardHeader">
                <h1>{event.eName}</h1>
                <p>{dateFormat(new Date(parsedTimestamp), "ddd, mmm dd")} | {event.eOrganizers}</p>
            </div>
            <div className="eventCardBody">
                <p>{event.eDescription}</p>
            </div>
            <div className="eventCardCategories">
                {categories.map((category) => {
                    return <Tag key={category} text={category} type={category} />;
                })}
            </div>
        </div>
    );
};

export default EventCard;
