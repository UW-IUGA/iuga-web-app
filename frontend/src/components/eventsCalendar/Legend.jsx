import { useId } from "react";
import { colorForLabels, EVENT_LABELS } from "../../utils/calendar/calendar";

// What the event colours mean, and the filter over them. Each tag keeps the key's
// colour square, filled while its events show and hollow once they are hidden,
// and is pressed to turn them on or off. Every tag is spelled out beside its colour,
// so nothing rests on colour alone (WCAG 1.4.1). Underneath, each is a real
// checkbox, so a keyboard and a screen reader use it as they would any other.
//
// `layout` is "column" under the mini month, where the sidebar is narrow and tall,
// and "row" in the controls, beside the range, where each tag is a chip.
// `className` lets a caller limit where a copy shows (see .legend--narrow-only).
// The filter's state is the caller's (useTagFilter), so both copies agree.
function Legend({ layout = "row", className, isTagShown, onToggle, onShowAll, isFiltered }) {
    const headingId = useId();

    return (
        <div
            className={["legend", `legend--${layout}`, className].filter(Boolean).join(" ")}
            role="group"
            aria-labelledby={headingId}
        >
            <span id={headingId} className="legend__heading">
                Filter
            </span>

            <ul className="legend__items">
                {EVENT_LABELS.map((tag) => {
                    const shown = isTagShown(tag);
                    return (
                        <li className="legend__item" key={tag}>
                            <label className={`legend__toggle${shown ? "" : " legend__toggle--off"}`}>
                                <input
                                    type="checkbox"
                                    className="legend__input"
                                    checked={shown}
                                    onChange={() => onToggle(tag)}
                                />
                                {/* The key's square, which shows the checkbox's state: the input itself is hidden. */}
                                <span
                                    className="legend__color"
                                    aria-hidden="true"
                                    style={{ "--legend-color": colorForLabels([tag]) }}
                                />
                                {tag}
                            </label>
                        </li>
                    );
                })}
            </ul>

            {isFiltered && (
                <button type="button" className="legend__showAll" onClick={onShowAll}>
                    Show all
                </button>
            )}
        </div>
    );
}

export default Legend;
