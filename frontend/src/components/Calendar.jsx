import dateFormat from "dateformat";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot, faUser, faClock, faUsers, faParagraph } from '@fortawesome/free-solid-svg-icons'
import { useState, useRef, useMemo, useEffect } from "react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, parseISO } from "date-fns";
import { useIsAuthenticated } from "@azure/msal-react";
import { toast} from 'react-toastify';
import EventDetailsLoader from "./EventDetailsLoader";
import Tag from "../components/Tag";
import Button from "../components/Button";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const eventPlaceholder = {
    "isPlaceholder": true,
    "eName": "No Event",
    "eLocation": "Location",
    "eOrganizers": "",
    "eDescription": ""
}

const Calendar = ({ calendarEvents, highlightEvent }) => {
    const isAuthenticated = useIsAuthenticated();
    const wrapperRef = useRef(null);
    const currentDate = highlightEvent ? parseISO(highlightEvent.eStartDate) : new Date();
    const [selectedDate, setSelectedDate] = useState(null);
    const [calendarDate, setDate] = useState(currentDate);
    const [selectedEvent, setEvent] = useState({});
    const [isActive, setActive] = useState(false);
    const [showLoader, setShowLoader] = useState(false);
    const [buttonDisabled, setButtonDisabled] = useState(false);
    const firstDayOfMonth = startOfMonth(calendarDate);
    const lastDayOfMonth = endOfMonth(calendarDate);
    const daysInMonth = eachDayOfInterval({
        start: firstDayOfMonth,
        end: lastDayOfMonth
    })
    const startingDayIndex = getDay(firstDayOfMonth);

    const eventsByDate = useMemo(() => {
        return calendarEvents.reduce((accumulator, event) => {
            const date = format(event.eStartDate, "yyyy-MM-dd");
            if (!accumulator[date]) {
                accumulator[date] = {}
            }

            accumulator[date] = event;
            return accumulator;
        }, {});
    }, [calendarEvents]);

    const prevMonth = () => {
        setDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1));
    }

    const nextMonth = () => {
        setDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1));
    }

    const showEventDetails = async (eid, date) => {
        setShowLoader(true);
        setActive(true);
        setSelectedDate(date);
        if (process.env.NODE_ENV === "production") {
            fetch(`http://localhost:7777/api/v1/events/id/${eid}`, {
                method: "GET",
            }).then((res) => res.json())
            .then((event) => {
                setTimeout(() => {
                    const formattedDate = format(new Date(event.eStartDate), "LLL dd, hh:mm aa");
                    event.eStartDate = formattedDate;
                    setEvent(event);
                    setShowLoader(false);
                }, 500);
            }).catch((error) => {
                setShowLoader(false);
                console.log(error);
            });
        } else {
            setTimeout(() => {
                setEvent(    {
                    "eId": "662450848a5036a39183aa2e",
                    "eName": "Mock Event",
                    "eStartDate": "2024-03-01T00:00:00.000Z",
                    "eEndDate": "2024-03-01T00:00:00.000Z",
                    "eLocation": "MGH120",
                    "eOrganizers": "IUGA",
                    "eDescription": "Eager to learn more about how to get your foot in the door with big tech companies for free?",
                    "eLabels": [
                      "Career"
                    ]
                });
                setShowLoader(false);
            }, 500);
        }
    };

    const handleClickOutside = event => {
        if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
            setActive(false);
            setSelectedDate(null);  // Reset selected date
        }
    };


    const handleRSVP = async (event, eId) => {
        event.preventDefault();
        if (isAuthenticated) {
            setButtonDisabled(true);
            fetch('http://localhost:7777/api/v1/events/rsvp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ eId: eId }),
            }).then((res) => res.json())
            .then(data => {
                setButtonDisabled(false);
                if (data.status === "error") {
                    toast.error(data.message);
                } else {
                    toast.success(data.message);
                }
            }).catch(err => {
                setButtonDisabled(false);
                toast.error("RSVP was not successful :( Please try again.");
                console.log(err);
            });
        } else {
            toast.error("Please login first to RSVP!");
        }
    };

    useEffect(() => {
        if (highlightEvent) {
            showEventDetails(highlightEvent.eId, format(highlightEvent.eStartDate, "yyyy-MM-dd"));
        }

        const timer = setTimeout(() => {
            document.addEventListener("click", handleClickOutside);
        }, 0);


        return () => {
            clearTimeout(timer);
            document.removeEventListener("click", handleClickOutside);
        };
    }, []);

    return (
        <div className="calendar">
            <div className="calendar-header">
                <img className="left-arrow" src="/assets/right-arrow.svg" alt="left arrow" onClick={prevMonth} />
                <div>
                    <h1>{dateFormat(calendarDate, "mmmm yyyy")}</h1>
                    <p>Click a highlighted date to learn more about that event!</p>
                </div>
                <img className="right-arrow" src="/assets/right-arrow.svg" alt="right arrow" onClick={nextMonth} />
            </div>
            <div className="calendar-wrapper" ref={wrapperRef}>
                <div className="calendar-content-wrapper">
                    <div>
                        {["Career", "Social", "Academic"].map(category => {
                            return <Tag key={category} text={category} style={category} />;
                        })}
                    </div>
                    <div className="calendar-item-container">
                        {
                            WEEKDAYS.map((weekday) => {
                                return <div key={weekday} className="calendar-weekday">{weekday}</div>
                            })
                        }
                        {
                            Array.from({ length: startingDayIndex }).map((_, index) => {
                                return <div key={`empty${index}`} className="calendar-item calendar-day-empty"></div>
                            })
                        }
                        {
                            daysInMonth.map((day, index) => {
                                const dateKey = format(day, "yyyy-MM-dd");
                                const currentEvent = eventsByDate[dateKey] || eventPlaceholder;
                                const eventClassName = "eLabels" in currentEvent ? `calendar-day-${currentEvent.eLabels[0].toLowerCase()}` : "calendar-day-none"
                                const isSelectedClass = "eLabels" in currentEvent && dateKey === selectedDate ? `calendar-day-selected-${currentEvent.eLabels[0].toLowerCase()}` : "";
                                return <div key={index} className={`calendar-item calendar-day-wrapper ${eventClassName} ${isSelectedClass}`} onClick={!currentEvent["isPlaceholder"] ? () => showEventDetails(currentEvent.eId, dateKey) : null}>
                                    <span className="calendar-day">{format(day, "d")}</span>
                                    <span className="calendar-day-event-name">{currentEvent.eName}</span>
                                    <span className="calendar-day-organizer-name">{currentEvent.eOrganizers}</span>
                                </div>
                            })
                        }
                        <img className="calendar-decoration" src="/assets/calendar-decoration.svg" alt="calendar decoration" />
                    </div>
                </div>
                {
                    isActive && selectedEvent &&
                    (showLoader ?
                        <EventDetailsLoader /> :
                        <div className="event-details-container">
                            <div className="event-details-wrapper">
                                <div className="event-details-content">
                                    <img></img>
                                    <div className="event-details-header">
                                        <h1>{selectedEvent.eName ? selectedEvent.eName : "Event Name"}</h1>
                                        <div className="event-details-info">
                                            <div className="event-details-section-header">
                                                <FontAwesomeIcon icon={faUser} />
                                                <p>{selectedEvent.eOrganizers ? selectedEvent.eOrganizers : "Organizers"}</p>
                                            </div>
                                            { selectedEvent.showParticipants && 
                                            (<div className="event-details-section-header">
                                                <FontAwesomeIcon icon={faUsers} />
                                                <p>{selectedEvent.participants} Participants</p>
                                            </div>)}
                                        </div>
                                    </div>
                                    <div className="event-details-tags">
                                        {selectedEvent.eLabels ? selectedEvent.eLabels.map(category => {
                                            return <Tag key={category} text={category} style={category} isSmall={true} />;
                                        }) : <Tag key={"social"} text={"social"} style={"social"} isSmall={true} />}
                                    </div>
                                    <div className="event-details-body">
                                        <div className="event-details-section-wrapper">
                                            <div>
                                                <div className="event-details-section">
                                                    <div className="event-details-section-header">
                                                        <FontAwesomeIcon icon={faLocationDot} />
                                                        <span>Location</span>
                                                    </div>
                                                    <p>{selectedEvent.eLocation ? selectedEvent.eLocation : "MGH120"}</p>
                                                </div>
                                                <div className="event-details-section">
                                                    <div className="event-details-section-header">
                                                        <FontAwesomeIcon icon={faClock} />
                                                        <span>Date</span>
                                                    </div>
                                                    <p>{selectedEvent.eStartDate ? selectedEvent.eStartDate : "Jan 12, 12 30 PM"}</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="event-details-section">
                                            <div className="event-details-section-header">
                                                <FontAwesomeIcon icon={faParagraph} />
                                                <span>Description</span>
                                            </div>
                                            <p>{selectedEvent.eDescription ? selectedEvent.eDescription : "Event Description"}</p>
                                        </div>
                                    </div>

                                    { selectedEvent.rsvpEnabled && (
                                    <div className="event-details-rsvp">
                                        { selectedEvent.rsvpQuestions.length != 0 && (<h1>Come Join Us!</h1>) }
                                        <form className="event-details-rsvp-form" onSubmit={(event) => handleRSVP(event, selectedEvent.eId)}>
                                            { selectedEvent.rsvpQuestions.map((question, i) => {
                                                <div>
                                                    <label html="eventqa" className="form-label">{question.qString}</label>
                                                    <input type="text" name="eventqa" id={i} placeholder="Your answer" className="form-input" required />
                                                </div>
                                            })}
                                            <span className="filler" />
                                            <Button text="RSVP" className="primary-button" isDisabled={buttonDisabled}/>
                                        </form>
                                    </div>
                                    )}
                                </div>
                            </div>
                        </div>)
                }
            </div>
        </div>
    );
};

export default Calendar;