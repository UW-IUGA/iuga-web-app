import dateFormat from "dateformat";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons'
import { useState, useRef, useMemo, useEffect } from "react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, parseISO } from "date-fns";
import EventDetailsLoader from "./EventDetailsLoader";
import Tag from "../components/Tag";
import EventDetailsCard from "./EventDetailsCard";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const eventPlaceholder = {
    "isPlaceholder": true,
    "eName": "No Event",
    "eLocation": "Location",
    "eOrganizers": "",
    "eDescription": ""
}

const Calendar = ({ calendarEvents, highlightEvent }) => {
    const wrapperRef = useRef(null);
    const currentDate = highlightEvent ? parseISO(highlightEvent.eStartDate) : new Date();
    const [selectedDate, setSelectedDate] = useState(null);
    const [calendarDate, setDate] = useState(currentDate);
    const [eventsByDate, setEventsByDate] = useState({});
    const [selectedEvent, setEvent] = useState({});
    const [isActive, setActive] = useState(false);
    const [showLoader, setShowLoader] = useState(false);
    const firstDayOfMonth = startOfMonth(calendarDate);
    const lastDayOfMonth = endOfMonth(calendarDate);
    const daysInMonth = eachDayOfInterval({
        start: firstDayOfMonth,
        end: lastDayOfMonth
    })
    const startingDayIndex = getDay(firstDayOfMonth);

    useMemo(() => {
        const eventsObj = calendarEvents.reduce((accumulator, event) => {
            const date = format(event.eStartDate, "yyyy-MM-dd");
            if (!accumulator[date]) {
                accumulator[date] = {}
            }

            accumulator[date] = event;
            return accumulator;
        }, {});

        setEventsByDate(eventsObj);
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
            fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:7777'}/api/v1/events/id/${eid}`, {
                method: "GET",
            }).then((res) => res.json())
            .then((event) => {
                setTimeout(() => {
                    const formattedDate = format(new Date(event.eStartDate), "LLL dd, hh:mm aa");
                    event.eStartDateFormatted = formattedDate;
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

    const handleRSVP = () => {
        const dateKey = format(selectedEvent.eStartDate, "yyyy-MM-dd");
        eventsByDate[dateKey].hasRSVPd = true;
        selectedEvent.hasRSVPd = true;
        setEvent(selectedEvent);
        setEventsByDate(eventsByDate);
    }

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
                                    <div className="calendar-day-container">
                                        {currentEvent.hasRSVPd && (
                                            <div>
                                                <FontAwesomeIcon size="xs" icon={faCheck} />
                                                <span className="calendar-rsvp-status">RSVPd</span>
                                            </div>
                                        )}
                                        <span className="calendar-day">{format(day, "d")}</span>
                                    </div>
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
                        <EventDetailsCard selectedEvent={selectedEvent} handleRSVP={handleRSVP} />
                    )
                }
            </div>
        </div>
    );
};

export default Calendar;