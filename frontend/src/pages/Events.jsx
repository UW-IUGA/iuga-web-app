import Calendar from "../components/Calendar";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot, faCalendar, faClock, faUsers } from '@fortawesome/free-solid-svg-icons'
import { useLocation } from 'react-router-dom';
import { useState, useRef, useEffect } from "react";
import { mockCalendarData } from "../assets/mock-data/MockCalendarData";
import Tag from "../components/Tag";
import Button from "../components/Button";

function EventsPage() {
    const {state, pathname} = useLocation();
    const [showCalendar, setCalendar] = useState(true);
    const [calendarEvents, setCalendarEvents] = useState([])

    const showEventDetails = (eid) => {
        console.log(eid);
        setCalendar(false);
    }

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    useEffect(() => {
        if (process.env.NODE_ENV === "production") {
            fetch("http://localhost:7777/api/v1/events/", {
                method: "GET",
            }).then((res) => res.json())
            .then((events) => {
                setCalendarEvents(events);
                console.log(events);
            }).catch((error) => {
                console.log(error);
            });
        } else {
            setCalendarEvents(mockCalendarData);
        }
      },[])

    return (
        <div>
            {showCalendar ? <Calendar callback={showEventDetails} calendarEvents={calendarEvents} highlightDate={state} /> : 
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
                        <form className="event-details-rsvp-form" onSubmit={() => false}>
                            <div>
                                <label html="eventqa" className="form-label">Question #1</label>
                                <input type="text" name="eventqa" id="eventqa" placeholder="Your answer" className="form-input" required />
                                <label html="eventqa" className="form-label">Question #2</label>
                                <input type="text" name="eventqa" id="eventqa" placeholder="Your answer" className="form-input" required />
                                <label html="eventqa" className="form-label">Question #3</label>
                                <input type="text" name="eventqa" id="eventqa" placeholder="Your answer" className="form-input" required />
                            </div>
                            <span className="filler" />
                            <Button text="RSVP" className="primary-button" />
                        </form>
                    </div>
                </div>
            </div>
            }
        </div>
    );
}
  
export default EventsPage;
  