import { colorForLabels, EVENT_LABELS } from "../../utils/calendar/calendar";

// What the event colours mean. A list rather than a row of spans, so a screen
// reader announces how many labels there are and can move through them. The
// color markers are decorative: each label is spelled out beside its colour, so
// nothing rests on colour alone (WCAG 1.4.1).
//
// `layout` is "column" under the mini month, where the sidebar is narrow and
// tall, and "row" in the controls, beside the range. `className` lets a caller
// limit where a copy shows (see .legend--narrow-only).
function Legend({ layout = "row", className }) {
  return (
    <ul
      className={["legend", `legend--${layout}`, className]
        .filter(Boolean)
        .join(" ")}
      aria-label="Event colours"
    >
      {EVENT_LABELS.map((label) => (
        <li className="legend__item" key={label}>
          <span
            className="legend__color"
            aria-hidden="true"
            style={{ backgroundColor: colorForLabels([label]) }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

export default Legend;
