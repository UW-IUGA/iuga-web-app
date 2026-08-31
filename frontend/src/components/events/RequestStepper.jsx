import { CHECKPOINTS, currentStage } from "../../utils/eventRequest";

/*
 * Seven-step progress rail for a single request. Completed checkpoints read as
 * done, the first incomplete checkpoint is the active step, and later steps are
 * upcoming. Rejected/archived requests collapse to a terminal note.
 */
function RequestStepper({ request }) {
    const terminal = request.status === "REJECTED" ? "Rejected" : request.status === "ARCHIVED" ? "Archived" : null;
    const active = currentStage(request);
    const checkpointStatus = (key) => request.checkpoints?.find((checkpoint) => checkpoint.key === key)?.status || "pending";

    return (
        <ol className="requestStepper" aria-label="Request progress">
            {CHECKPOINTS.map(([key, label]) => {
                const done = checkpointStatus(key) === "completed";
                const isActive = !terminal && !done && key === active;
                const state = terminal ? "terminal" : done ? "done" : isActive ? "active" : "upcoming";
                return (
                    <li key={key} className={`requestStepper__step requestStepper__step--${state}`} aria-current={isActive ? "step" : undefined}>
                        <span className="requestStepper__marker" aria-hidden="true">{done ? "✓" : ""}</span>
                        <span className="requestStepper__label">{label}</span>
                    </li>
                );
            })}
            {terminal && <li className="requestStepper__step requestStepper__step--rejected"><span className="requestStepper__label">{terminal}</span></li>}
        </ol>
    );
}

export default RequestStepper;
