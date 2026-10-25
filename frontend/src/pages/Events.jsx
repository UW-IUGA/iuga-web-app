import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { pastEvents } from "../assets/data/PastEventsData";
import { mockCalendarData, mockEvent } from "../assets/mock-data/MockCalendarData";
import { mockUpcomingEvents } from "../assets/mock-data/MockUpcomingEvents";
import EventAgenda from "../components/EventAgenda";
import EventDialog from "../components/EventDialog";
import EventOperations from "../components/EventOperations";
import PastEventCard from "../components/PastEventCard";
import PhotoCollage from "../components/PhotoCollage";
import PhotoLightbox from "../components/PhotoLightbox";
import { useAuthContext } from "../context/AuthContext";
import { isProduction } from "../runtime";

const DEV_EVENTS = [...mockCalendarData, ...mockUpcomingEvents];

// The hero collage previews past events, drawing on the first two photos of each.
const HERO_PHOTOS = pastEvents.flatMap((event) => event.photos.slice(0, 2));

const pastEventEyebrow = (event) => [event.when, event.time, event.location].filter(Boolean).join(" · ");

// The fields the list leaves out: description, photo, and RSVP settings.
const loadEventDetails = async (event) => {
    if (!isProduction) {
        return { ...mockEvent, ...event, ...DEV_EVENTS.find((devEvent) => devEvent.eId === event.eId) };
    }

    const res = await fetch(`/api/v1/events/id/${event.eId}`, { method: "GET" });
    if (!res.ok) throw new Error(`${res.status}, ${res.statusText}`);
    return res.json();
};

function EventsPage() {
    const { isAuthenticated, can } = useAuthContext();
    const { state, pathname } = useLocation();
    const [calendarEvents, setCalendarEvents] = useState([]);
    // "loading" until the list arrives, then "ready"; "failed" if it could not be fetched.
    const [eventsStatus, setEventsStatus] = useState("loading");
    // Bumped to fetch the list again after a failure.
    const [eventsRequest, setEventsRequest] = useState(0);
    // The open event dialog: the event as it was opened (a list record, or the eId and date
    // another page linked to) and its details, which are null until they load.
    const [dialog, setDialog] = useState(null);
    const openEvent = dialog?.event;
    const openEventDetails = useCallback((event) => setDialog({ event, details: null }), []);
    const closeEventDetails = useCallback(() => setDialog(null), []);
    // Events RSVPd to in the current sign-in session; the list itself only knows what the
    // server said when it loaded. The session number changes whenever sign-in state does.
    const [rsvps, setRsvps] = useState({ session: 0, eventIds: new Set() });
    // The past event whose photos are open in the viewer, and which photo is showing.
    const [openPhoto, setOpenPhoto] = useState(null);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    // RSVPs belong to whoever was signed in when they were made, so a new session starts empty.
    useEffect(() => {
        setRsvps((current) => ({ session: current.session + 1, eventIds: new Set() }));
    }, [isAuthenticated]);

    useEffect(() => {
        let isCurrent = true;

        if (!isProduction) {
            setCalendarEvents(DEV_EVENTS);
            setEventsStatus("ready");
            return () => {
                isCurrent = false;
            };
        }

        // A list that is already showing stays up while it is refreshed, for example after signing in.
        setEventsStatus((status) => (status === "ready" ? status : "loading"));

        fetch("/api/v1/events/", { method: "GET" })
            .then((res) => {
                if (!res.ok) throw new Error(`${res.status}, ${res.statusText}`);
                return res.json();
            })
            .then((events) => {
                if (!isCurrent) return;
                setCalendarEvents(events);
                setEventsStatus("ready");
            })
            .catch((error) => {
                console.error("Unable to load events", error);
                if (isCurrent) setEventsStatus("failed");
            });

        return () => {
            isCurrent = false;
        };
    }, [isAuthenticated, eventsRequest]);

    // The dialog opens straight away with what is already known; this fills in the rest.
    useEffect(() => {
        if (!openEvent) return undefined;
        let isCurrent = true;

        loadEventDetails(openEvent)
            .then((details) => {
                if (isCurrent) setDialog({ event: openEvent, details });
            })
            .catch((error) => {
                console.error("Unable to load event details", error);
                if (!isCurrent) return;
                toast.error("We couldn't load this event's details. Please try again.");
                setDialog(null);
            });

        return () => {
            isCurrent = false;
        };
    }, [openEvent]);

    useEffect(() => {
        if (state?.eId) openEventDetails({ eId: state.eId, eStartDate: state.eStartDate });
    }, [openEventDetails, state]);

    // An RSVP can finish after someone else has signed in on the same computer; it only
    // counts for the session it was sent in.
    const markRsvpd = (eId, sentInSession) => {
        setRsvps((current) =>
            current.session === sentInSession ? { ...current, eventIds: new Set(current.eventIds).add(eId) } : current,
        );
    };

    // An event counts as RSVPd if the server said so or the student RSVPd since, and only while signed in.
    const withRsvpState = (event) => ({
        ...event,
        hasRSVPd: isAuthenticated && (Boolean(event.hasRSVPd) || rsvps.eventIds.has(event.eId)),
    });
    const agendaEvents = calendarEvents.map(withRsvpState);
    const dialogEvent = dialog && withRsvpState({ ...dialog.event, ...dialog.details });

    const closePhoto = useCallback(() => setOpenPhoto(null), []);

    return (
        <div className="baseContainer eventsPage">
            <header className="eventsHero">
                <div>
                    <span className="eventsHero__kicker">IUGA EVENTS</span>
                    <h1>Find what&apos;s happening this week.</h1>
                </div>
                <PhotoCollage photos={HERO_PHOTOS} />
            </header>

            <EventAgenda
                events={agendaEvents}
                initialDate={state?.eStartDate}
                status={eventsStatus}
                onRetry={() => setEventsRequest((request) => request + 1)}
                onSelectEvent={openEventDetails}
            />

            <section className="eventsPast" aria-labelledby="past-events-heading">
                <h2 id="past-events-heading">Previous events.</h2>
                <div className="eventsPast__list">
                    {pastEvents.map((event, position) => (
                        <PastEventCard
                            event={event}
                            key={event.id}
                            reversed={position % 2 === 1}
                            onOpenPhoto={(index) => setOpenPhoto({ event, index })}
                        />
                    ))}
                </div>
            </section>

            <PhotoLightbox
                photos={openPhoto?.event.photos}
                index={openPhoto?.index ?? null}
                title={openPhoto?.event.name}
                eyebrow={openPhoto ? pastEventEyebrow(openPhoto.event) : undefined}
                onIndexChange={(index) => setOpenPhoto((current) => ({ ...current, index }))}
                onClose={closePhoto}
            />

            <EventDialog
                event={dialogEvent}
                isLoading={Boolean(dialog) && !dialog.details}
                onRsvp={(eId) => markRsvpd(eId, rsvps.session)}
                onClose={closeEventDetails}
            />

            <EventOperations
                canManageRequests={can("events.requests.manage")}
                canApproveLeadership={can("events.leadership.approve")}
                canManageFinance={can("events.finance.manage")}
                canCompletePurchases={can("events.purchases.complete")}
            />
        </div>
    );
}

export default EventsPage;
