import { STEPPER_STEPS, stepComplete } from "../../utils/eventRequest";

/*
 * Progress rail for a single request. Completed steps read as done, the first
 * incomplete step is active, later steps are upcoming. Room booking is folded
 * into the Finance step. Rejected/archived requests collapse to a terminal note.
 */
function RequestStepper({ request }) {
    const terminal = request.status === "REJECTED" ? "Rejected" : request.status === "ARCHIVED" ? "Archived" : null;
    const activeIndex = STEPPER_STEPS.findIndex((step) => !stepComplete(request, step));

    return (
        <ol className="requestStepper" aria-label="Request progress">
            {STEPPER_STEPS.map((step, index) => {
                const done = stepComplete(request, step);
                const isActive = !terminal && !done && index === activeIndex;
                const state = terminal ? "terminal" : done ? "done" : isActive ? "active" : "upcoming";
                return (
                    <li key={step.key} className={`requestStepper__step requestStepper__step--${state}`} aria-current={isActive ? "step" : undefined}>
                        <span className="requestStepper__marker" aria-hidden="true">{done ? "✓" : ""}</span>
                        <span className="requestStepper__label">{step.label}</span>
                    </li>
                );
            })}
            {terminal && <li className="requestStepper__step requestStepper__step--rejected"><span className="requestStepper__label">{terminal}</span></li>}
        </ol>
    );
}

export default RequestStepper;
