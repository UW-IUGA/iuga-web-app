import { useRef } from "react";
import { VIEW_LABELS as LABELS, VIEW_MODES } from "../../hooks/useCalendarView";

// Arrow keys move between views, as a radio group's do. Left/Up go back,
// Right/Down forward, both wrapping; Home and End jump to the ends.
const STEP_KEYS = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

// One anchor rendered at four resolutions, so the control is a radio group
// rather than a set of toggles — exactly one view is always active.
//
// It behaves like one from the keyboard too: the group is a single Tab stop
// (only the checked option is tabbable) and the arrows choose within it, so
// Tab moves on past the toggle instead of through all four views.
function ViewToggle({ mode, onChange }) {
    const optionRefs = useRef({});

    const choose = (view) => {
        onChange(view);
        optionRefs.current[view]?.focus();
    };

    const onKeyDown = (event) => {
        const index = VIEW_MODES.indexOf(mode);
        let next = null;

        if (event.key in STEP_KEYS) {
            const length = VIEW_MODES.length;
            next = VIEW_MODES[(index + STEP_KEYS[event.key] + length) % length];
        } else if (event.key === "Home") {
            next = VIEW_MODES[0];
        } else if (event.key === "End") {
            next = VIEW_MODES[VIEW_MODES.length - 1];
        }

        if (next) {
            event.preventDefault();
            choose(next);
        }
    };

    return (
        <div className="toggle" role="radiogroup" aria-label="Calendar view" onKeyDown={onKeyDown}>
            {VIEW_MODES.map((view) => {
                const isActive = view === mode;

                return (
                    <button
                        key={view}
                        ref={(el) => {
                            optionRefs.current[view] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        tabIndex={isActive ? 0 : -1}
                        className={`toggle__option${isActive ? " toggle__option--active" : ""}`}
                        // Read by the stylesheet to reserve each label's bold width.
                        data-label={LABELS[view]}
                        onClick={() => choose(view)}
                    >
                        {LABELS[view]}
                    </button>
                );
            })}
        </div>
    );
}

export default ViewToggle;
