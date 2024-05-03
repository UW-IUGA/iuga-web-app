import Calendar from "../components/Calendar";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot, faCalendar, faClock, faUsers } from '@fortawesome/free-solid-svg-icons'
import { useState, useRef, useEffect } from "react";
import Tag from "../components/Tag";
import Button from "../components/Button";

function EventsPage() {
    const [showCalendar, setCalendar] = useState(true);

    const showEventDetails = (eid) => {
        setCalendar(false);
    }

    return (
        <div>
            {showCalendar ? <Calendar callback={showEventDetails} /> : 
            <div className="event-details-container">
                <div className="event-details-header" onClick={() => setCalendar(true)}>
                    <img className="left-arrow" src="/assets/right-arrow.svg" alt="left arrow" />
                    <p>Back to Calendar</p>
                </div>

                <div className="event-details-wrapper">
                    <div className="event-details-content">
                        <img></img>
                        <div className="event-details-body">
                            <h1>Title</h1>
                            <h2>Organizers</h2>
                            <p>Description</p>
                            <div className="event-details-section-wrapper">
                                <div className="event-details-section">
                                    <div className="event-details-section-header">
                                        <FontAwesomeIcon icon={faLocationDot} />
                                        <span>Location</span>
                                    </div>
                                    <p>Location</p>
                                </div>
                                <div className="event-details-section">
                                    <div className="event-details-section-header">
                                        <FontAwesomeIcon icon={faCalendar} />
                                        <span>Date</span>
                                    </div>
                                    <p>Date</p>
                                </div>
                                <div className="event-details-section">
                                    <div className="event-details-section-header">
                                        <FontAwesomeIcon icon={faClock} />
                                        <span>Time</span>
                                    </div>
                                    <p>Time</p>
                                </div>
                            </div>
                            <div>
                                { ["Career", "Social", "Academic"].map(category => {
                                    return <Tag key={category} text={category} style={category} />;
                                })}
                            </div>
                        </div>
                    </div>
                    <span className="divider"></span>
                    <div className="event-details-rsvp">
                        <h1>Come Join Us!</h1>
                        <div className="event-details-section-header">
                            <FontAwesomeIcon icon={faUsers} />
                            <span>24 Attending</span>
                        </div>
                        <p>form</p>
                        <Button text="RSVP" className="primary-button" />

                    </div>
                </div>
            </div>
            }
        </div>
    );
}
  
export default EventsPage;
  