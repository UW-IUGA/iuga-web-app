import dateFormat from "dateformat";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLocationDot, faCalendar, faClock, faUsers } from '@fortawesome/free-solid-svg-icons'
import { useState, useRef, useMemo, useEffect } from "react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, parseISO } from "date-fns";
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

const Calendar = ({ calendarEvents, highlightDate }) => {
    const wrapperRef = useRef(null);
    const currentDate = highlightDate ? parseISO(highlightDate) : new Date();
    const [calendarDate, setDate] = useState(currentDate);
    const [isActive, setActive] = useState(false);
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

    const showEventDetails = () => {
        setActive(true);
    };

    const handleClickOutside = event => {
        if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
            setActive(false);
        }
    };

    useEffect(() => {
        document.addEventListener("click", handleClickOutside, false);

        return () => {
            document.removeEventListener("click", handleClickOutside, false);
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
                                return <div key={index} className={`calendar-item calendar-day-wrapper ${eventClassName}`} onClick={!currentEvent["isPlaceholder"] ? () => showEventDetails(currentEvent.eId) : null}>
                                    <span className="calendar-day">{format(day, "d")}</span>
                                    <span className="calendar-day-event-name">{currentEvent.eName}</span>
                                    <span className="calendar-day-organizer-name">{currentEvent.eOrganizers}</span>
                                </div>
                            })
                        }
                        <img className="calendar-decoration" src="/assets/calendar-decoration.svg" alt="calendar decoration" />
                    </div>
                </div>
                <div className={`event-details-container ${isActive ? "displayDetails" : ""}`}>
                    <div className="event-details-wrapper">
                        <div className="event-details-content">
                            <img></img>
                            <div className="event-details-header">
                                <h1>Title</h1>
                                <h2>Organizers</h2>
                            </div>
                            <div className="event-details-section-header">
                                    <FontAwesomeIcon icon={faUsers} />
                                    <span>24 Attending</span>
                            </div>
                            <div className="event-details-tags">
                                {["Career", "Social", "Academic"].map(category => {
                                    return <Tag key={category} text={category} style={category} isSmall={true} />;
                                })}
                            </div>
                            <div className="event-details-body">
                                <div className="event-details-section-wrapper">
                                    <div className="event-details-section">
                                        <div className="event-details-section-header">
                                            <FontAwesomeIcon icon={faLocationDot} />
                                            <span>Location</span>
                                        </div>
                                        <p>Location</p>
                                    </div>
                                    {/* <div className="event-details-section">
                                        <div className="event-details-section-header">
                                            <FontAwesomeIcon icon={faCalendar} />
                                            <span>Date</span>
                                        </div>
                                        <p>Date</p>
                                    </div> */}
                                    <div className="event-details-section">
                                        <div className="event-details-section-header">
                                            <FontAwesomeIcon icon={faClock} />
                                            <span>Time</span>
                                        </div>
                                        <p>Time</p>
                                    </div>
                                </div>
                                <p>Description</p>
                            </div>

                            <div className="event-details-rsvp">
                                <h1>Come Join Us!</h1>
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
                </div>
            </div>
        </div>
    );
};

export default Calendar;