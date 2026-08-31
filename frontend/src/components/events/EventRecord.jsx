function eventDateLabel(event) {
    if (!event?.eStartDate) return "Date to be announced";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.eStartDate));
}

function dateTimeLabel(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function money(cents) {
    return cents === undefined || cents === null ? "—" : `$${(cents / 100).toFixed(2)}`;
}

/*
 * Read-only view of a request's full state. Rendered inside the pipeline detail
 * page and from the admin calendar when an officer opens a published event.
 * `record` is the { event, eventRequest } shape returned by
 * GET /api/v1/events/admin/:eId.
 */
function EventRecord({ record, onClose }) {
    if (!record) return null;
    const { event = {}, eventRequest } = record;
    const marketingCheckpoint = eventRequest?.checkpoints?.find((checkpoint) => checkpoint.key === "marketing");

    return (
        <section className="adminEventRecord editorial-card" aria-labelledby="event-record-heading">
            <div className="adminEventsSectionHeader">
                <div><span className="event-ops-kicker">Event repository</span><h2 id="event-record-heading">{eventRequest?.eventName || event.eName}</h2></div>
                {onClose && <button className="standard-button" type="button" onClick={onClose}>Close record</button>}
            </div>
            <div className="adminEventRecordGrid">
                <div><strong>Requesting group</strong><p>{eventRequest?.requestingGroup || event.eOrganizers || "—"}</p></div>
                <div><strong>Event date</strong><p>{eventDateLabel(event)}</p></div>
                <div><strong>Location</strong><p>{eventRequest?.booking?.location || event.eLocation || "—"}</p></div>
                <div><strong>Expected attendance</strong><p>{eventRequest?.estimatedAttendance ?? "—"}</p></div>
                <div><strong>Funding requested</strong><p>{money(eventRequest?.fundingRequestedCents)}</p></div>
                <div><strong>Funding allocated</strong><p>{money(eventRequest?.finance?.allocatedCents)}</p></div>
                <div><strong>Meeting decision</strong><p>{eventRequest?.agendaOutcome?.note || "—"}</p></div>
                <div><strong>Booking time</strong><p>{eventRequest?.booking?.startDate ? `${dateTimeLabel(eventRequest.booking.startDate)} – ${dateTimeLabel(eventRequest.booking.endDate)}` : "—"}</p></div>
                <div className="adminEventRecordGrid__wide"><strong>Finance notes</strong><p>{eventRequest?.finance?.notes || "—"}</p></div>
                <div className="adminEventRecordGrid__wide"><strong>Marketing designs</strong><p>{marketingCheckpoint?.link ? <a href={marketingCheckpoint.link} target="_blank" rel="noreferrer">Open the archived OneDrive design link</a> : "—"}</p></div>
                <div className="adminEventRecordGrid__wide"><strong>Purpose</strong><p>{eventRequest?.purpose || "—"}</p></div>
                <div className="adminEventRecordGrid__wide"><strong>Description</strong><p>{eventRequest?.description || event.eDescription || "—"}</p></div>
                <div className="adminEventRecordGrid__wide"><strong>Purchase history</strong>{eventRequest?.purchases?.length ? <ul>{eventRequest.purchases.map((purchase) => <li key={purchase._id || `${purchase.description}-${purchase.purchasedAt}`}>{purchase.description} — {money(purchase.amountCents)}{purchase.vendor ? ` · ${purchase.vendor}` : ""}{purchase.receiptUrl ? <> · <a href={purchase.receiptUrl} target="_blank" rel="noreferrer">Receipt</a></> : ""}</li>)}</ul> : <p>No purchases recorded.</p>}</div>
            </div>
        </section>
    );
}

export default EventRecord;
