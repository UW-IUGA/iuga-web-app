import { useEffect, useState } from "react";
import AdminRoute from "../components/AdminRoute";
import EventRecord from "../components/events/EventRecord";
import { useAuthContext } from "../context/AuthContext";

function eventDateLabel(event) {
    if (!event.eStartDate) return "Date to be announced";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.eStartDate));
}

function AdminRepository() {
    const { signIn } = useAuthContext();
    const [events, setEvents] = useState([]);
    const [record, setRecord] = useState(null);
    const [sessionExpired, setSessionExpired] = useState(false);
    const [error, setError] = useState("");

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
            setRecord(data);
        } catch (requestError) {
            setError(requestError.message);
        }
    };

    return (
        <AdminRoute requiredPermission="events.requests.view">
            <main className="baseContainer adminPage">
                <header className="adminPageHeader">
                    <span className="event-ops-kicker">Exec board workspace</span>
                    <h1>Repository</h1>
                    <p>Browse published events and open the full record for any past or upcoming event.</p>
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
                {record && <EventRecord record={record} onClose={() => setRecord(null)} />}
            </main>
        </AdminRoute>
    );
}

export default AdminRepository;
