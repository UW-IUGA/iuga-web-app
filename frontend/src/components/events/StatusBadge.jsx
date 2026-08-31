function StatusBadge({ status }) {
    const label = String(status || "unknown").replace(/_/g, " ");
    return <span className={`event-ops-status event-ops-status-${status || "unknown"}`}>{label}</span>;
}

export default StatusBadge;
