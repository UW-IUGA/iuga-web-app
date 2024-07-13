import Calendar from "../components/Calendar";
import { useLocation } from 'react-router-dom';
import { useState, useEffect } from "react";
import { mockCalendarData } from "../assets/mock-data/MockCalendarData";
import { useAuthContext } from "../context/AuthContext";
import MediaQuery from "react-responsive";

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
        <>
            <MediaQuery minWidth={1024}>
                <Calendar calendarEvents={calendarEvents} highlightEvent={state} setCalendarEvents={setCalendarEvents} />
            </MediaQuery>
            <MediaQuery minWidth={340} maxWidth={1023}>
                <div className="constructionContainer">
                    <p>🚧 The Mobile Calendar Page is Under Construction! 🚧</p>
                    <p>🚧 Please use your PC to access this page. 🚧</p>
                    <img src="/assets/about-main.png" alt="group of iuga students" />
                </div>
            </MediaQuery>
        </>
    );
}
  
export default EventsPage;
  