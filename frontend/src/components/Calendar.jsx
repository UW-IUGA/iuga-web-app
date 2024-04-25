import dateFormat from "dateformat";
import { useState, useRef, useEffect } from "react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format } from "date-fns";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const currentDate = new Date()
const firstDayOfMonth = startOfMonth(currentDate);
const lastDayOfMonth = endOfMonth(currentDate);
const daysInMonth = eachDayOfInterval({
    start: firstDayOfMonth,
    end: lastDayOfMonth
})

const Calendar = () => {
    const wrapperRef = useRef(null);
    const [isActive, setActive] = useState("false");

    const toggle = () => {
        setActive(true); 
    };

    useEffect(() => {
        document.addEventListener("click", handleClickOutside, false);

        return () => {
            document.removeEventListener("click", handleClickOutside, false);
        };
    }, []);

    const handleClickOutside = event => {
        if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
            setActive(false);
        }
    };

    return (
    <div className="calendar">
        <div className="calendar-header">
            <h1>{dateFormat(currentDate, "mmmm yyyy")}</h1>
        </div>
        <div className="calendar-wrapper" ref={wrapperRef}>
            <div className="calendar-item-container">
                {
                    WEEKDAYS.map((weekday) => {
                        return <div key={weekday} className="calendar-item calendar-weekday">{weekday}</div>
                    })
                }
                {
                    daysInMonth.map((day, index) => {
                        return <div key={index} className="calendar-item calendar-day-wrapper" onClick={toggle}>
                            <span className="calendar-day">{format(day, "d")}</span>
                            <span className="calendar-day-event-name">Event Name</span>
                            <span className="calendar-day-organizer-name">Organizer Name</span>
                        </div>
                    })
                }
                <img className="calendar-decoration" src="/assets/calendar-decoration.svg" alt="calendar decoration" />
            </div>
            <div className={`eventDetails ${isActive ? "displayDetails" : ""}`}>

            </div>
        </div>
    </div>

    );
  };

  export default Calendar;