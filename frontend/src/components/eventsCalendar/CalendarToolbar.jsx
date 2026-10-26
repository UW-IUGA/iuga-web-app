import useMediaQuery from "../../hooks/useMediaQuery";
import { MOBILE_QUERY } from "../../utils/calendar/breakpoints";
import { formatRange } from "../../utils/calendar/calendar";
import DatePicker from "./DatePicker";
import Legend from "./Legend";
import ViewSelect from "./ViewSelect";
import ViewToggle from "./ViewToggle";

// What one arrow press moves by, for the arrows' accessible names.
const UNIT = {
    month: "month",
    week: "week",
    day: "day",
};

// Today, prev / next, the range the view is showing, and the view switch —
// the same order Google Calendar uses. The navigation steps by the current
// view's unit.
//
// Year view is the whole archive and does not step, so it shows only the
// label, at the far left, and the switch. The toolbar keeps the navigation's
// height either way (see .toolbar), so leaving it out does not move the
// switch up or down.
//
// The colour legend sits under the range in the year view, which has no
// sidebar. The other views keep theirs under the mini month instead, so here
// they show it only where that sidebar is hidden, on a narrow screen.
//
// Whatever is under the range, the first line stays put: the toolbar aligns
// to the top, and the navigation, the range and the switch each fill the
// same 40px line, so a taller year toolbar never moves the switch.
//
// On a narrow screen the range takes the first line, the controls the next —
// Today, the arrows and the switch, now a dropdown — and the legend the last.
// Where the view steps, the range there is a button opening the date picker
// (DatePicker), which stands in for the hidden sidebar. Being a control, it
// comes first in the source too, so Tab meets it first, as it is seen. The
// legend, after the controls on screen, holds nothing focusable.
function CalendarToolbar({ mode, anchor, events = [], onModeChange, onToday, onStep, onPickDate }) {
    const unit = UNIT[mode];
    const hasPicker = useMediaQuery(MOBILE_QUERY) && Boolean(unit);

    return (
        <div className="toolbar">
            {hasPicker && <DatePicker mode={mode} anchor={anchor} events={events} onPickDate={onPickDate} />}

            {unit && (
                <div className="toolbar__nav">
                    <button type="button" className="toolbar__today" onClick={onToday}>
                        Today
                    </button>
                    <button
                        type="button"
                        className="toolbar__arrow"
                        aria-label={`Previous ${unit}`}
                        onClick={() => onStep(-1)}
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        className="toolbar__arrow"
                        aria-label={`Next ${unit}`}
                        onClick={() => onStep(1)}
                    >
                        ›
                    </button>
                </div>
            )}

            <div className="toolbar__lead">
                {!hasPicker && (
                    <p className="toolbar__range" aria-live="polite">
                        {formatRange(mode, anchor)}
                    </p>
                )}
                <Legend className={mode === "year" ? null : "legend--narrow-only"} />
            </div>

            {/* The radio group on a wide screen, the dropdown on a narrow one. */}
            <div className="toolbar__switch">
                <ViewToggle mode={mode} onChange={onModeChange} />
                <ViewSelect mode={mode} onChange={onModeChange} />
            </div>
        </div>
    );
}

export default CalendarToolbar;
