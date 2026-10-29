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

const PrototypeEventRsvpContext = createContext(null);

// Shares one event's loaded details and the RSVPs made this sign-in session across
// every view that shows the event (popover, day overlay, day view).
export function PrototypeEventRsvpProvider({ variant, children }) {
    const { isAuthenticated } = useAuthContext();
    // eId -> { status: "loading" | "ready" | "failed", details }
    const [details, setDetails] = useState(() => new Map());
    const requested = useRef(new Set());
    // Events RSVPd to in the current sign-in session. The session number changes
    // whenever sign-in state does, so an RSVP only counts for whoever sent it.
    const [rsvps, setRsvps] = useState({ session: 0, eventIds: new Set() });

    // A new session sees its own RSVP state, so drop what the last one loaded.
    useEffect(() => {
        setRsvps((current) => ({
            session: current.session + 1,
            eventIds: new Set(),
        }));
        setDetails(new Map());
        requested.current = new Set();
    }, [isAuthenticated]);

    const load = useCallback((eId) => {
        requested.current.add(eId);
        setDetails((current) => new Map(current).set(eId, { status: "loading", details: null }));
        loadEventDetails(eId)
            .then((loaded) => setDetails((current) => new Map(current).set(eId, { status: "ready", details: loaded })))
            .catch((error) => {
                console.error("Unable to load event details", error);
                setDetails((current) => new Map(current).set(eId, { status: "failed", details: null }));
            });
    }, []);

    const requestDetails = useCallback(
        (eId) => {
            if (eId && !requested.current.has(eId)) load(eId);
        },
        [load],
    );

    const markRsvpd = useCallback((eId, sentInSession) => {
        setRsvps((current) =>
            current.session === sentInSession ? { ...current, eventIds: new Set(current.eventIds).add(eId) } : current,
        );
    }, []);

    const value = {
        variant,
        session: rsvps.session,
        detailsFor: (eId) => details.get(eId) ?? { status: "loading", details: null },
        requestDetails,
        retryDetails: load,
        // RSVPd if the server said so or the student RSVPd since, and only while signed in.
        hasRsvpd: (eId, serverFlag) => isAuthenticated && (Boolean(serverFlag) || rsvps.eventIds.has(eId)),
        markRsvpd,
    };

    return <PrototypeEventRsvpContext.Provider value={value}>{children}</PrototypeEventRsvpContext.Provider>;
}

// Null outside the provider, so the calendar renders exactly as before without it.
export function usePrototypeEventRsvp() {
    return useContext(PrototypeEventRsvpContext);
}
