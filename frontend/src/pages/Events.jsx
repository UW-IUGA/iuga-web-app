import { format } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { mockCalendarData, mockEvent } from "../assets/mock-data/MockCalendarData";
import EventDetailsCard from "../components/EventDetailsCard";
import EventDetailsLoader from "../components/EventDetailsLoader";
import EventOperations from "../components/EventOperations";
import EventStream from "../components/EventStream";
import WeeklyCalendar from "../components/WeeklyCalendar";
import { useAuthContext } from "../context/AuthContext";
import { isProduction } from "../runtime";

const EVENT_CATEGORIES = ["Academic", "Social", "Professional"];

function EventsPage() {
    const { isAuthenticated, isAdmin } = useAuthContext();
    const { state, pathname } = useLocation();
    const [calendarEvents, setCalendarEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [isDetailsActive, setDetailsActive] = useState(false);
    const [showLoader, setShowLoader] = useState(false);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    useEffect(() => {
        let isCurrent = true;

        if (!isProduction) {
            setCalendarEvents(mockCalendarData);
            return () => {
                isCurrent = false;
            };
        }

        fetch("/api/v1/events/", { method: "GET" })
            .then((res) => {
                if (!res.ok) throw new Error(`${res.status}, ${res.statusText}`);
                return res.json();
            })
            .then((events) => {
                if (isCurrent) setCalendarEvents(events);
            })
            .catch((error) => {
                console.error("Unable to load events", error);
            });

        return () => {
            isCurrent = false;
        };
    }, [isAuthenticated]);

    const openEventDetails = useCallback((event) => {
        setDetailsActive(true);
        setShowLoader(true);

        if (!isProduction) {
            setSelectedEvent({
                ...mockEvent,
                eId: event.eId,
                eName: event.eName,
                eStartDate: event.eStartDate,
                eLocation: event.eLocation,
                eLabels: event.eLabels,
            });
            setShowLoader(false);
            return;
        }

        fetch(`/api/v1/events/id/${event.eId}`, { method: "GET" })
            .then((res) => {
                if (!res.ok) throw new Error(`${res.status}, ${res.statusText}`);
                return res.json();
            })
            .then((eventDetails) => {
                setSelectedEvent({
                    ...eventDetails,
                    eStartDateFormatted: format(new Date(eventDetails.eStartDate), "LLL dd, hh:mm aa"),
                });
                setShowLoader(false);
            })
            .catch((error) => {
                console.error("Unable to load event details", error);
                setShowLoader(false);
                setDetailsActive(false);
            });
    }, []);

    useEffect(() => {
        if (state?.eId) {
            openEventDetails({ eId: state.eId, eStartDate: state.eStartDate });
        }
    }, [openEventDetails, state]);

    const deselectEventDetails = useCallback(() => {
        setDetailsActive(false);
        setSelectedEvent(null);
    }, []);

    const handleRSVP = useCallback(() => {
        if (!selectedEvent) return;

        setSelectedEvent((currentEvent) => ({ ...currentEvent, hasRSVPd: true }));
        setCalendarEvents((events) => events.map((event) => (
            event.eId === selectedEvent.eId ? { ...event, hasRSVPd: true } : event
        )));
    }, [selectedEvent]);

    return (
        <div className="baseContainer eventsPage">
            <header className="eventsHero">
                <div>
                    <span className="eventsEyebrow">IUGA EVENTS</span>
                    <h1>Find what&apos;s happening this week.</h1>
                    <p>
                        Find your events, your community, that help create your story at UW.
                    </p>
		</div>
            </header>

            <WeeklyCalendar
                events={calendarEvents}
                initialDate={state?.eStartDate}
                onSelectEvent={openEventDetails}
            />

            <section className="eventStreamsSection" aria-labelledby="event-streams-heading">
                <div className="eventStreamsIntro">
                    <div>
                        <span className="eventsEyebrow">KEEP EXPLORING</span>
                        <h2 id="event-streams-heading">Something for every kind of week.</h2>
                    </div>
                    <p>Three ways to find your people, build your toolkit, or simply show up.</p>
                </div>
                <div className="eventStreamsGrid">
                    {EVENT_CATEGORIES.map((category) => (
                        <div className={`eventStreamColumn eventStreamColumn-${category.toLowerCase()}`} key={category}>
                            <h3>{category} events</h3>
                            <EventStream category={category} events={calendarEvents} />
                        </div>
                    ))}
                </div>
            </section>

            {isDetailsActive && (
                <aside className="eventsDetailsPanel" aria-label="Event details">
                    {showLoader ? (
                        <EventDetailsLoader />
                    ) : (
                        <EventDetailsCard
                            selectedEvent={selectedEvent}
                            handleRSVP={handleRSVP}
                            deselectEventDetails={deselectEventDetails}
                        />
                    )}
                </aside>
            )}

            <EventOperations isAdmin={isAdmin} />
        </div>
    );
}

export default EventsPage;
