import { useId } from "react";
import { VIEW_LABELS, VIEW_MODES } from "../../hooks/useCalendarView";

// The view switch on a narrow screen. The radio group's four options do not
// fit on one line beside Today and the arrows on a phone, so there the switch
// folds into a dropdown, as Google Calendar's does.
//
// A native <select>, so a phone opens its own picker and a screen reader
// announces it as the familiar control it is, with nothing to re-implement.
// The label is visually hidden: the chosen view is already on the control,
// and the name says what choosing does.
//
// The stylesheet shows this or the radio group, never both, from the same
// query, so a screen reader only ever meets one switch.
function ViewSelect({ mode, onChange }) {
    const id = useId();

    return (
        <div className="view-select">
            <label className="sr-only" htmlFor={id}>
                Calendar view
            </label>
            <select
                id={id}
                className="view-select__input"
                value={mode}
                onChange={(event) => onChange(event.target.value)}
            >
                {VIEW_MODES.map((view) => (
                    <option key={view} value={view}>
                        {VIEW_LABELS[view]}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default ViewSelect;
