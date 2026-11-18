import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { mockCalendarData, mockEvent } from "../../assets/mock-data/MockCalendarData";
import { mockUpcomingEvents } from "../../assets/mock-data/MockUpcomingEvents";
import { useAuthContext } from "../../context/AuthContext";
import { isProduction } from "../../runtime";

const SAMPLE_EVENTS = [...mockCalendarData, ...mockUpcomingEvents];

// The fields the list leaves out: RSVP settings, sign-up link and attendance.
const loadEventDetails = async (eId) => {
    if (!isProduction) {
        return {
            ...mockEvent,
            ...SAMPLE_EVENTS.find((sample) => sample.eId === eId),
        };
    }

    const res = await fetch(`/api/v1/events/id/${eId}`, { method: "GET" });
    if (!res.ok) throw new Error(`${res.status}, ${res.statusText}`);
    return res.json();
};

const EventRsvpContext = createContext(null);

// Shares one event's loaded details and the RSVPs made this sign-in session across
// every view that shows the event (popover, day overlay, day view).
export function EventRsvpProvider({ children }) {
    const { isAuthenticated } = useAuthContext();
    // eId -> { status: "loading" | "ready" | "failed", details }
    const [details, setDetails] = useState(() => new Map());
    const requested = useRef(new Set());
    // Events RSVPd to in the current sign-in session. The session number changes
    // whenever sign-in state does, so an RSVP only counts for whoever sent it.
    const [rsvps, setRsvps] = useState({ session: 0, eventIds: new Set() });
    // The sign-in session the loaded details belong to, readable from a request still in flight.
    const detailsSession = useRef(0);
    const lastSignInState = useRef(isAuthenticated);

    // A new session sees its own RSVP state, so drop what the last one loaded.
    // Mounting is not a change of sign-in, and resetting then would forget details
    // that the first events on screen have already asked for.
    useEffect(() => {
        if (lastSignInState.current === isAuthenticated) return;
        lastSignInState.current = isAuthenticated;
        detailsSession.current += 1;
        setRsvps((current) => ({
            session: current.session + 1,
            eventIds: new Set(),
        }));
        setDetails(new Map());
        requested.current = new Set();
    }, [isAuthenticated]);

    const load = useCallback((eId) => {
        const session = detailsSession.current;
        // A reply for a session that has since ended describes the wrong student.
        const save = (entry) => {
            if (detailsSession.current === session) setDetails((current) => new Map(current).set(eId, entry));
        };
        requested.current.add(eId);
        save({ status: "loading", details: null });
        loadEventDetails(eId)
            .then((loaded) => save({ status: "ready", details: loaded }))
            .catch((error) => {
                console.error("Unable to load event details", error);
                save({ status: "failed", details: null });
            });
    }, []);

    // A new function each sign-in session, so every event detail on screen asks
    // again once the session's change has dropped its details.
    const requestDetails = useCallback(
        (eId) => {
            if (eId && !requested.current.has(eId)) load(eId);
        },
        [load, rsvps.session],
    );

    const markRsvpd = useCallback((eId, sentInSession) => {
        setRsvps((current) =>
            current.session === sentInSession ? { ...current, eventIds: new Set(current.eventIds).add(eId) } : current,
        );
    }, []);

    const value = {
        session: rsvps.session,
        detailsFor: (eId) => details.get(eId) ?? { status: "loading", details: null },
        requestDetails,
        retryDetails: load,
        // RSVPd if the server said so or the student RSVPd since, and only while signed in.
        hasRsvpd: (eId, serverFlag) => isAuthenticated && (Boolean(serverFlag) || rsvps.eventIds.has(eId)),
        markRsvpd,
    };

    return <EventRsvpContext.Provider value={value}>{children}</EventRsvpContext.Provider>;
}

// Null outside the provider, where event details show without an RSVP block.
export function useEventRsvp() {
    return useContext(EventRsvpContext);
}
