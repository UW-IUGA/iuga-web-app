import dateFormat from "dateformat";
import { useState, useRef, useMemo } from "react";
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, isSameDay } from "date-fns";
import Tag from "./Tag";

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const currentDate = new Date();
const eventPlaceholder = {
    "isPlaceholder": true,
    "eName": "Event Name",
    "eLocation": "Location",
    "eOrganizers": "Organizer Name",
    "eDescription": ""
}

const Calendar = ({ callback, calendarEvents }) => {
    const wrapperRef = useRef(null);
    const [calendarDate, setDate] = useState(new Date(currentDate.getFullYear(), currentDate.getMonth()));

    const eventsByDate = useMemo(() => {
        return calendarEvents.reduce((accumulator, event) => {
            const date = format(event.eStartDate, "yyyy-MM-dd");
            if (!accumulator[date]) {
                accumulator[date] = {}
            }

            accumulator[date] = event;
            return accumulator;
        }, {});
    }, [calendarEvents])

    let firstDayOfMonth = startOfMonth(calendarDate);
    let lastDayOfMonth = endOfMonth(calendarDate);
    let daysInMonth = eachDayOfInterval({
        start: firstDayOfMonth,
        end: lastDayOfMonth
    })
    let startingDayIndex = getDay(firstDayOfMonth);

    const prevMonth = () => {
        setDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1));
    }

    const nextMonth = () => {
        setDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1));
    }

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
                                return <div key={index} className={`calendar-item calendar-day-wrapper ${eventClassName}`} onClick={!currentEvent["isPlaceholder"] ? () => callback(currentEvent.eId) : null}>
                                    <span className="calendar-day">{format(day, "d")}</span>
                                    <span className="calendar-day-event-name">{currentEvent.eName}</span>
                                    <span className="calendar-day-organizer-name">{currentEvent.eOrganizers}</span>
                                </div>
                            })
                        }
                        <img className="calendar-decoration" src="/assets/calendar-decoration.svg" alt="calendar decoration" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Calendar;