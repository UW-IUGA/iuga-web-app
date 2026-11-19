import { useEffect, useId, useRef, useState } from "react";
import useSwipeStep from "../../hooks/useSwipeStep";
import { dayKeyOf, formatMonthYear, formatRange, zonedMidnight, zonedParts } from "../../utils/calendar/calendar";
import MonthDays from "./MonthDays";
import MonthStrip from "./MonthStrip";

// What the range button says it opens, after the range itself.
const PICKS = { month: "choose month", week: "choose date", day: "choose date" };

/**
 * The range on a phone, where the sidebar's mini month is hidden: pressing it
 * opens a picker under it, as Google Calendar's title does.
 *
 * - Month view: a strip of months. A tap goes to that month.
 * - Week and day: the strip over a mini month. The strip, or a swipe across
 *   the mini month, changes the month it shows; a tap on a day goes there.
 *
 * There are no arrows. The strip is one tap to any month, which is the
 * single-pointer way to do what the swipe does (WCAG 2.5.1).
 *
 * A disclosure: the button carries aria-expanded, Escape closes the panel,
 * and focus comes back to the button when a pick or Escape closes it.
 *
 * It also closes when something outside it is clicked — empty space, or
 * another control, which still does what it does — when the view moves (a
 * swipe of the calendar), and when focus moves elsewhere from the keyboard.
 * Focus is left where the person put it then.
 */
function DatePicker({ mode, anchor, events, onPickDate }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);
    const buttonRef = useRef(null);
    const panelId = useId();

    // A click anywhere outside the picker closes it. On the click, not the
    // press: the panel sits above the controls, so closing it on press moved
    // them up under the finger before it lifted, and the tap then landed on
    // whatever had moved into its place. By the click the browser has settled
    // what was pressed, so that control still acts. Captured, so nothing that
    // stops the click on its way up can keep the picker open.
    useEffect(() => {
        if (!open) return undefined;

        const onClick = (event) => {
            if (!rootRef.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener("click", onClick, true);
        return () => document.removeEventListener("click", onClick, true);
    }, [open]);

    // A swipe of the calendar, or anything else that moves the view while the
    // picker is open, closes it too: a swipe never makes a click. Checked during
    // render, so no frame shows the picker for a date it no longer matches.
    const anchorKey = dayKeyOf(anchor);
    const [seenAnchor, setSeenAnchor] = useState(anchorKey);
    if (seenAnchor !== anchorKey) {
        setSeenAnchor(anchorKey);
        if (open) setOpen(false);
    }

    // Tabbing out of it closes it too. Only when focus has visibly gone
    // somewhere else: Safari does not focus a button it clicks, so a tap inside
    // the panel can blur with nowhere to go, and that must not close it.
    const onBlur = (event) => {
        const next = event.relatedTarget;
        if (next && !rootRef.current?.contains(next)) setOpen(false);
    };

    const close = () => {
        setOpen(false);
        buttonRef.current?.focus();
    };

    const pick = (date) => {
        onPickDate(date);
        close();
    };

    const onKeyDown = (event) => {
        if (event.key === "Escape" && open) {
            event.stopPropagation();
            close();
        }
    };

    return (
        <div className="picker" ref={rootRef} onKeyDown={onKeyDown} onBlur={onBlur}>
            <button
                ref={buttonRef}
                type="button"
                className="picker__toggle"
                aria-expanded={open}
                // Only while the panel exists: pointing at an id that is not in the
                // page tells a screen reader of a control that is not there.
                aria-controls={open ? panelId : undefined}
                onClick={() => setOpen((value) => !value)}
            >
                {/* Live, as the plain range is on a wide screen, so a step or swipe
            is announced. The rest of the name is outside it, so only the new
            range is read. */}
                <span aria-live="polite">{formatRange(mode, anchor)}</span>
                <span className="sr-only">, {PICKS[mode]}</span>
                <span className="picker__chevron" aria-hidden="true" />
            </button>

            {open && (
                <div className="picker__panel" id={panelId}>
                    {mode === "month" ? (
                        <MonthStrip
                            label="Months"
                            selected={zonedParts(anchor)}
                            onPick={({ year, month }) => pick(zonedMidnight(year, month, 1))}
                        />
                    ) : (
                        // Keyed by the day, so a step or swipe of the view behind brings
                        // the picker back to the anchor's month.
                        <PickerMonth key={dayKeyOf(anchor)} anchor={anchor} events={events} onPickDay={pick} />
                    )}
                </div>
            )}
        </div>
    );
}

// The week and day views' panel: the strip choosing the month, and that
// month's days under it. Browsing here moves only the picker; nothing moves
// the view until a day is picked.
function PickerMonth({ anchor, events, onPickDay }) {
    const { year, month } = zonedParts(anchor);
    const [shown, setShown] = useState({ year, month });
    const bodyRef = useRef(null);

    const browse = (amount) => {
        const target = new Date(Date.UTC(shown.year, shown.month + amount, 1));
        setShown({ year: target.getUTCFullYear(), month: target.getUTCMonth() });
    };

    useSwipeStep(bodyRef, browse);

    return (
        <>
            <MonthStrip label="Months" selected={shown} onPick={setShown} />

            <div className="picker__month">
                {/* Announced, since a swipe changes nothing else a screen reader would
            notice. */}
                <p className="picker__month-label" aria-live="polite">
                    {formatMonthYear(zonedMidnight(shown.year, shown.month, 15))}
                </p>
                <MonthDays
                    year={shown.year}
                    month={shown.month}
                    anchor={anchor}
                    events={events}
                    onPickDay={onPickDay}
                    bodyRef={bodyRef}
                />
            </div>
        </>
    );
}

export default DatePicker;
