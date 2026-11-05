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

/**
 * Purpose: Navigate the calendar date and choose its view.
 * Expected Response Information: Renders date navigation, the current date range, view selection,
 *   and the event legend. On narrow screens, the range becomes a date picker and view selection
 *   becomes a dropdown; year view has no step controls.
 */
function CalendarControls({
  mode,
  anchor,
  events = [],
  onModeChange,
  onToday,
  onStep,
  onPickDate,
}) {
  const unit = UNIT[mode];
  const hasPicker = useMediaQuery(MOBILE_QUERY) && Boolean(unit);

  return (
    <div className="calendar-controls">
      {hasPicker && (
        <DatePicker
          mode={mode}
          anchor={anchor}
          events={events}
          onPickDate={onPickDate}
        />
      )}

      {unit && (
        <div className="calendar-controls__nav">
          <button
            type="button"
            className="calendar-controls__today"
            onClick={onToday}
          >
            Today
          </button>
          <button
            type="button"
            className="calendar-controls__arrow"
            aria-label={`Previous ${unit}`}
            onClick={() => onStep(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="calendar-controls__arrow"
            aria-label={`Next ${unit}`}
            onClick={() => onStep(1)}
          >
            ›
          </button>
        </div>
      )}

      <div className="calendar-controls__lead">
        {!hasPicker && (
          <p className="calendar-controls__range" aria-live="polite">
            {formatRange(mode, anchor)}
          </p>
        )}
        <Legend className={mode === "year" ? null : "legend--narrow-only"} />
      </div>

      {/* The radio group on a wide screen, the dropdown on a narrow one. */}
      <div className="calendar-controls__switch">
        <ViewToggle mode={mode} onChange={onModeChange} />
        <ViewSelect mode={mode} onChange={onModeChange} />
      </div>
    </div>
  );
}

export default CalendarControls;
