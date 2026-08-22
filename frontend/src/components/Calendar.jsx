import dateFormat from "dateformat";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faArrowRight, faCheck } from '@fortawesome/free-solid-svg-icons'
import { useState, useMemo, useEffect, useCallback } from "react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, parseISO } from "date-fns";
import EventDetailsLoader from "./EventDetailsLoader";
import Tag from "../components/Tag";
import EventDetailsCard from "./EventDetailsCard";
import { mockEvent } from "../assets/mock-data/MockCalendarData";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const eventPlaceholder = {
    "isPlaceholder": true,
    "eName": "No Event",
    "eLocation": "Location",
    "eOrganizers": "",
    "eDescription": ""
}

const Calendar = ({ calendarEvents, highlightEvent }) => {

    const currentDate = highlightEvent ? parseISO(highlightEvent.eStartDate) : new Date();
    const [selectedDate, setSelectedDate] = useState(null);
    const [calendarDate, setDate] = useState(currentDate);
    const [eventsByDate, setEventsByDate] = useState({});
    const [selectedEvent, setEvent] = useState(null);
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
            fetch(`/api/v1/events/id/${eid}`, {
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
                setEvent(mockEvent);
                setShowLoader(false);
            }, 500);
        }
    };

    const deselectEventDetails = useCallback(() => {
        setActive(false);
        setSelectedDate(null);
    }, []);

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
    }, [highlightEvent]);

    return (
        <div className="calendar">
            <div className="calendar-header">
                <button className="calendar-nav-button" type="button" aria-label="Previous month" onClick={prevMonth}>
                    <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
                </button>
                <div>
                    <h1>{dateFormat(calendarDate, "mmmm yyyy")}</h1>
                    <p>Click an event to learn more.</p>
                </div>
                <button className="calendar-nav-button" type="button" aria-label="Next month" onClick={nextMonth}>
                    <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
                </button>
            </div>
            <div className="calendar-wrapper">
                <div className="calendar-content-wrapper">
                    <div className="calendar-tag-wrapper">
                        {["Career", "Social", "Academic"].map(category => {
                            return <Tag key={category} text={category} type={category} />;
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
                                const today = new Date();
                                const eventStartDate = new Date(currentEvent.eStartDate);
                                const hasEvent = !currentEvent["isPlaceholder"];
                                const openEvent = () => showEventDetails(currentEvent.eId, dateKey);
                                return <div
                                    key={index}
                                    className={`calendar-item calendar-day-wrapper ${eventClassName} ${isSelectedClass}`}
                                    role={hasEvent ? "button" : undefined}
                                    tabIndex={hasEvent ? 0 : undefined}
                                    aria-label={hasEvent ? `${currentEvent.eName} on ${format(day, "MMMM d, yyyy")}` : undefined}
                                    onClick={hasEvent ? openEvent : undefined}
                                    onKeyDown={hasEvent ? (event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                            event.preventDefault();
                                            openEvent();
                                        }
                                    } : undefined}
                                >
                                    <div className="calendar-day-container">
                                        {currentEvent.hasRSVPd && (
                                            <div>
                                                <FontAwesomeIcon size="xs" icon={faCheck} aria-hidden="true" />
                                                <span className="calendar-rsvp-status">{eventStartDate < today ? "" : "RSVPd"}</span>
                                            </div>
                                        )}
                                        <span className="calendar-day">{format(day, "d")}</span>
                                    </div>
                                    <span className="calendar-day-event-name">{currentEvent.eName}</span>
                                    <span className="calendar-day-organizer-name">{currentEvent.eOrganizers}</span>
                                </div>
                            })
                        }
                    </div>
                </div>
                {
                    isActive &&
                    (showLoader ?
                        <EventDetailsLoader /> :
                        <EventDetailsCard selectedEvent={selectedEvent} handleRSVP={handleRSVP} deselectEventDetails={deselectEventDetails} />
                    )
                }
            </div>
        </div>
    );
};

export default Calendar;
