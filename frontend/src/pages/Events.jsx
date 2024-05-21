import Calendar from "../components/Calendar";
import { useLocation } from 'react-router-dom';
import { useState, useEffect } from "react";
import { mockCalendarData } from "../assets/mock-data/MockCalendarData";
import { useAuthContext } from "../context/AuthContext";

function EventsPage() {
    const { isAuthenticated } = useAuthContext();
    const {state, pathname} = useLocation();
    const [calendarEvents, setCalendarEvents] = useState([])

    const fetchCalendarData = () => {
        if (process.env.NODE_ENV === "production") {
            fetch(`${process.env.REACT_APP_API_URL}/api/v1/events/`, {
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
    }

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    useEffect(() => {
        fetchCalendarData();
    },[isAuthenticated]);

    return (
        <Calendar calendarEvents={calendarEvents} highlightEvent={state} setCalendarEvents={setCalendarEvents} />
    );
}
  
export default EventsPage;
  