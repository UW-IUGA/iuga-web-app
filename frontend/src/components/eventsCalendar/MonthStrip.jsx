import { useLayoutEffect, useRef } from "react";
import { MONTH_NAMES } from "../../utils/calendar/calendar";

// Left/Right step a month, Home and End jump to the ends of the strip.
const STEP_KEYS = { ArrowLeft: -1, ArrowRight: 1 };

// The three years around `year`, a month at a time.
function monthsAround(year) {
    const months = [];
    for (let y = year - 1; y <= year + 1; y += 1) {
        for (let m = 0; m < 12; m += 1) months.push({ year: y, month: m });
    }
    return months;
}

const keyOf = ({ year, month }) => `${year}-${month}`;

/**
 * A sideways row of months, for the date picker on a phone. It scrolls
 * natively, so a finger flicks through it; each month is one tap, which is
 * also what keeps the picker within WCAG 2.5.1 — the mini month under it
 * changes month by swipe, and this is the single-tap way to do the same.
 *
 * `selected` is the month marked and kept in view. The strip spans the year
 * before it to the year after, and re-centres as it moves.
 *
 * One Tab stop, like the view toggle: only the selected month is tabbable,
 * and the arrow keys move focus along the strip, Enter or Space picking.
 */
function MonthStrip({ selected, onPick, label }) {
    const scrollRef = useRef(null);
    const itemRefs = useRef({});
    const months = monthsAround(selected.year);
    const selectedKey = keyOf(selected);

    // Centre the selected month. Set on the strip itself rather than through
    // scrollIntoView, which would scroll the page as well.
    useLayoutEffect(() => {
        const strip = scrollRef.current;
        const item = itemRefs.current[selectedKey];
        if (!strip || !item) return;
        strip.scrollLeft = item.offsetLeft - (strip.clientWidth - item.offsetWidth) / 2;
    }, [selectedKey]);

    const onKeyDown = (event) => {
        const index = months.findIndex((entry) => keyOf(entry) === document.activeElement?.dataset.month);
        if (index === -1) return;

        let next = null;
        if (event.key in STEP_KEYS) next = months[index + STEP_KEYS[event.key]];
        else if (event.key === "Home") next = months[0];
        else if (event.key === "End") next = months[months.length - 1];

        if (next) {
            event.preventDefault();
            itemRefs.current[keyOf(next)]?.focus();
        }
    };

    return (
        <div className="strip" ref={scrollRef} role="group" aria-label={label} onKeyDown={onKeyDown}>
            {months.map((entry) => {
                const key = keyOf(entry);
                const isSelected = key === selectedKey;

                return (
                    <button
                        key={key}
                        ref={(el) => {
                            itemRefs.current[key] = el;
                        }}
                        type="button"
                        data-month={key}
                        className={`strip__month${isSelected ? " strip__month--selected" : ""}`}
                        tabIndex={isSelected ? 0 : -1}
                        aria-current={isSelected ? "date" : undefined}
                        onClick={() => onPick(entry)}
                    >
                        {MONTH_NAMES[entry.month].slice(0, 3)}{" "}
                        {/* The year shows where one begins, and is read on every month,
                so the name is "Oct 2026" wherever focus lands. The space is
                outside the span: inside, it was dropped from the name, which
                came out "Oct2026". */}
                        <span className={entry.month === 0 ? "strip__year" : "sr-only"}>{entry.year}</span>
                    </button>
                );
            })}
        </div>
    );
}

export default MonthStrip;
