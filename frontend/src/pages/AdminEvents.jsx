import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminRoute from "../components/AdminRoute";
import EventOperations from "../components/EventOperations";
import { useAuthContext } from "../context/AuthContext";

function eventDateLabel(event) {
    if (!event.eStartDate) return "Date to be announced";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.eStartDate));
}

function dateTimeLabel(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(cents) {
    return cents === undefined || cents === null ? "—" : `$${(cents / 100).toFixed(2)}`;
}

function AdminEvents() {
    const { can, activeCycle, signIn } = useAuthContext();
    const navigate = useNavigate();
    const [events, setEvents] = useState([]);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [sessionExpired, setSessionExpired] = useState(false);
    const [showRequests, setShowRequests] = useState(false);
    const [error, setError] = useState("");

    const openEvent = async (event) => {
        try {
            const response = await fetch(`/api/v1/events/admin/${event.eId}`, { credentials: "include" });
            const contentType = response.headers.get("content-type") || "";
            const data = contentType.includes("application/json") ? await response.json() : {};
            if (response.status === 401) {
                setSessionExpired(true);
                throw new Error("Your board session expired. Sign in again to view the event record.");
            }
            if (!response.ok) throw new Error(data.message || "Event details could not be loaded.");
            setSelectedEvent(data);
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    useEffect(() => {
        fetch("/api/v1/events/", { credentials: "include" })
            .then(async (response) => {
                const contentType = response.headers.get("content-type") || "";
                const data = contentType.includes("application/json") ? await response.json() : {};
                if (!response.ok) throw new Error(data.message || "Published events could not be loaded.");
                if (!contentType.includes("application/json")) throw new Error("Published events returned an invalid server response. Restart the backend and refresh.");
                setEvents(Array.isArray(data) ? data : data.events || []);
            })
            .catch((requestError) => setError(requestError.message));
    }, []);

    return (
        <AdminRoute requiredPermission="events.requests.view">
            <main className="baseContainer adminPage">
                <header className="adminPageHeader">
                    <span className="event-ops-kicker">Exec board workspace</span>
                    <h1>Events</h1>
                    <p>View published events and manage new event requests from one workspace.</p>
                </header>
                {error && <div className="event-ops-error" role="alert"><span>{error}</span>{sessionExpired && <button className="standard-button" type="button" onClick={signIn}>Sign in again</button>}</div>}
                <section className="adminMemoryList" aria-labelledby="published-events-heading">
                    <div className="adminEventsSectionHeader">
                        <div>
                            <span className="event-ops-kicker">Public calendar</span>
                            <h2 id="published-events-heading">Published events</h2>
                        </div>
                        <span>{events.length} {events.length === 1 ? "event" : "events"}</span>
                    </div>
                    {events.length > 0 ? <div className="adminPublishedEventsGrid">
                        {events.map((event) => <button className="adminMemoryCard adminPublishedEventCard editorial-card" type="button" key={String(event.eId)} onClick={() => openEvent(event)}>
                            <span className="event-ops-kicker">Published</span>
                            <h3>{event.eName}</h3>
                            <p>{eventDateLabel(event)}</p>
                            <p>{event.eLocation || "Location to be announced"}</p>
                            {event.eOrganizers && <small>{event.eOrganizers}</small>}
                            <span className="adminPublishedEventCard__action">View event record →</span>
                        </button>)}
                    </div> : <p className="adminMemoryEmpty">No published events are on the calendar yet.</p>}
                </section>
                {selectedEvent && <section className="adminEventRecord editorial-card" aria-labelledby="event-record-heading">
                    <div className="adminEventsSectionHeader">
                        <div><span className="event-ops-kicker">Event repository</span><h2 id="event-record-heading">{selectedEvent.eventRequest?.eventName || selectedEvent.event.eName}</h2></div>
                        <button className="standard-button" type="button" onClick={() => setSelectedEvent(null)}>Close record</button>
                    </div>
                    <div className="adminEventRecordGrid">
                        <div><strong>Requesting group</strong><p>{selectedEvent.eventRequest?.requestingGroup || selectedEvent.event.eOrganizers || "—"}</p></div>
                        <div><strong>Event date</strong><p>{eventDateLabel(selectedEvent.event)}</p></div>
                        <div><strong>Location</strong><p>{selectedEvent.eventRequest?.booking?.location || selectedEvent.event.eLocation || "—"}</p></div>
                        <div><strong>Expected attendance</strong><p>{selectedEvent.eventRequest?.estimatedAttendance ?? "—"}</p></div>
                        <div><strong>Funding requested</strong><p>{money(selectedEvent.eventRequest?.fundingRequestedCents)}</p></div>
                        <div><strong>Funding allocated</strong><p>{money(selectedEvent.eventRequest?.finance?.allocatedCents)}</p></div>
                        <div><strong>Meeting decision</strong><p>{selectedEvent.eventRequest?.agendaOutcome?.note || "—"}</p></div>
                        <div><strong>Booking time</strong><p>{selectedEvent.eventRequest?.booking?.startDate ? `${dateTimeLabel(selectedEvent.eventRequest.booking.startDate)} – ${dateTimeLabel(selectedEvent.eventRequest.booking.endDate)}` : "—"}</p></div>
                        <div className="adminEventRecordGrid__wide"><strong>Finance notes</strong><p>{selectedEvent.eventRequest?.finance?.notes || "—"}</p></div>
                        <div className="adminEventRecordGrid__wide"><strong>Marketing designs</strong><p>{selectedEvent.eventRequest?.checkpoints?.find((checkpoint) => checkpoint.key === "marketing")?.link ? <a href={selectedEvent.eventRequest.checkpoints.find((checkpoint) => checkpoint.key === "marketing").link} target="_blank" rel="noreferrer">Open the archived OneDrive design link</a> : "—"}</p></div>
                        <div className="adminEventRecordGrid__wide"><strong>Purpose</strong><p>{selectedEvent.eventRequest?.purpose || "—"}</p></div>
                        <div className="adminEventRecordGrid__wide"><strong>Description</strong><p>{selectedEvent.eventRequest?.description || selectedEvent.event.eDescription || "—"}</p></div>
                        <div className="adminEventRecordGrid__wide"><strong>Purchase history</strong>{selectedEvent.eventRequest?.purchases?.length ? <ul>{selectedEvent.eventRequest.purchases.map((purchase) => <li key={purchase._id || `${purchase.description}-${purchase.purchasedAt}`}>{purchase.description} — {money(purchase.amountCents)}{purchase.vendor ? ` · ${purchase.vendor}` : ""}{purchase.receiptUrl ? <> · <a href={purchase.receiptUrl} target="_blank" rel="noreferrer">Receipt</a></> : ""}</li>)}</ul> : <p>No purchases recorded.</p>}</div>
                    </div>
                </section>}
                <section className="adminMemoryList" aria-labelledby="event-requests-heading">
                    <div className="adminEventsSectionHeader">
                        <div>
                            <span className="event-ops-kicker">Workflow</span>
                            <h2 id="event-requests-heading">Event requests</h2>
                        </div>
                        <button className="cta-secondary" type="button" onClick={() => setShowRequests((visible) => !visible)}>
                            {showRequests ? "Hide event requests" : "Manage event requests"}
                        </button>
                    </div>
                    {showRequests && <EventOperations can={can} activeCycle={activeCycle} onPurchaseComplete={(requestId) => navigate(`/admin/events/review/${requestId}`)} />}
                </section>
            </main>
        </AdminRoute>
    );
}

export default AdminEvents;
