import Calendar from "../components/Calendar";
import { useLocation } from 'react-router-dom';
import { useState, useEffect } from "react";
import { mockCalendarData } from "../assets/mock-data/MockCalendarData";

function EventsPage() {
    const {state, pathname} = useLocation();
    const [calendarEvents, setCalendarEvents] = useState([])

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
            }).catch((error) => {
                console.log(error);
            });
        } else {
            setCalendarEvents(mockCalendarData);
        }
    },[])

    return (
        <Calendar calendarEvents={calendarEvents} highlightEvent={state} />
    );
}
  
export default EventsPage;
  