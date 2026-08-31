import { formatDate } from "../../utils/eventRequest";

function DecisionHistory({ entries, showHeading = true }) {
    if (!entries?.length) return null;
    return (
        <section className="event-ops-detail-section" aria-labelledby={showHeading ? "event-audit-heading" : undefined} aria-label={showHeading ? undefined : "Decision history"}>
            {showHeading && <h4 id="event-audit-heading">Decision history</h4>}
            <ol className="event-ops-audit-list">
                {entries.map((entry) => <li key={entry._id || `${entry.action}-${entry.createdAt}`}><strong>{String(entry.action).replace(/_/g, " ")}</strong><span>{formatDate(entry.createdAt)}</span>{entry.comment && <p>{entry.comment}</p>}</li>)}
            </ol>
        </section>
    );
}

export default DecisionHistory;
