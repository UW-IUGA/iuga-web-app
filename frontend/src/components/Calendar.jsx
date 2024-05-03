import dateFormat from "dateformat";
import { useState, useRef, useEffect } from "react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay } from "date-fns";
import Tag from "./Tag";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const currentDate = new Date();

const Calendar = () => {
    const wrapperRef = useRef(null);
    const [isActive, setActive] = useState(false);
    const [calendarDate, setDate] = useState(new Date(currentDate.getFullYear(), currentDate.getMonth()));

    let firstDayOfMonth = startOfMonth(calendarDate);
    let lastDayOfMonth = endOfMonth(calendarDate);
    let daysInMonth = eachDayOfInterval({
        start: firstDayOfMonth,
        end: lastDayOfMonth
    })
    let startingDayIndex = getDay(firstDayOfMonth);

    const toggle = () => {
        setActive(true); 
    };

    const prevMonth = () => {
        setDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth()-1));
    }   

    const nextMonth = () => {
        setDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth()+1));
    }

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
                <img className="left-arrow" src="/assets/right-arrow.svg" alt="right arrow" onClick={prevMonth} />
                <div>
                    <h1>{dateFormat(calendarDate, "mmmm yyyy")}</h1>
                    <p>Click a highlighted date to learn more about that event!</p>
                </div>
                <img className="right-arrow" src="/assets/right-arrow.svg" alt="right arrow" onClick={nextMonth} />
            </div>
            <div className="calendar-wrapper" ref={wrapperRef}>
                <div className="calendar-content-wrapper">
                    <div>
                        { ["Career", "Social", "Academic"].map(category => {
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
                                return <div key={index} className="calendar-item calendar-day-wrapper" onClick={() => toggle()}>
                                    <span className="calendar-day">{format(day, "d")}</span>
                                    <span className="calendar-day-event-name">Event Name</span>
                                    <span className="calendar-day-organizer-name">Organizer Name</span>
                                </div>
                            })
                        }
                        <img className="calendar-decoration" src="/assets/calendar-decoration.svg" alt="calendar decoration" />
                    </div>
                </div>
                <div className={`eventDetails ${isActive ? "displayDetails" : ""}`}>
                </div>
            </div>
        </div>
    );
  };

  export default Calendar;