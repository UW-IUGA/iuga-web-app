import { useState } from "react";
import { dayKeyOf, formatMonthYear, zonedMidnight, zonedParts } from "../../utils/calendar/calendar";
import MonthDays from "./MonthDays";

// The sidebar month. Shared by the month, week and day views, so it takes the
// anchor from outside and reports picks back up rather than owning either. A
// pick moves the view that is showing to that date; it does not switch view.
//
// Its arrows browse a month of its own and never move the main view: they are
// for looking ahead, not for navigating. Navigation runs the other way only.
// Whenever the anchor moves, or the toolbar's Today / arrows are pressed
// (`syncKey` changes), the sidebar snaps back to the anchor's month.

function MiniMonth({ anchor, events, onPickDay, syncKey = 0 }) {
    const anchorParts = zonedParts(anchor);
    const anchorMonth = { year: anchorParts.year, month: anchorParts.month };

    const [shown, setShown] = useState(anchorMonth);

    // Snap back during render rather than in an effect: the label and the grid
    // must change together, and an effect would flash a frame in which they
    // disagree. The whole day is part of the key, not just its month, so a
    // toolbar step that stays inside the anchor's month still brings a browsed
    // sidebar home; `syncKey` covers a Today press that does not move the
    // anchor at all.
    const seenKey = `${dayKeyOf(anchor)}|${syncKey}`;
    const [seen, setSeen] = useState(seenKey);
    if (seen !== seenKey) {
        setSeen(seenKey);
        setShown(anchorMonth);
    }

    const browse = (amount) => {
        const target = new Date(Date.UTC(shown.year, shown.month + amount, 1));
        setShown({ year: target.getUTCFullYear(), month: target.getUTCMonth() });
    };

    const label = formatMonthYear(zonedMidnight(shown.year, shown.month, 15));

    return (
        <aside className="mini" aria-label="Month at a glance">
            <div className="mini__header">
                {/* Announced as it changes, since browsing moves nothing else on the
            page that a screen reader would notice. */}
                <p className="mini__label" aria-live="polite">
                    {label}
                </p>

                <div className="mini__controls">
                    <button
                        type="button"
                        className="mini__button mini__button--icon"
                        aria-label="Show previous month"
                        onClick={() => browse(-1)}
                    >
                        ‹
                    </button>
                    <button
                        type="button"
                        className="mini__button mini__button--icon"
                        aria-label="Show next month"
                        onClick={() => browse(1)}
                    >
                        ›
                    </button>
                </div>
            </div>

            <MonthDays year={shown.year} month={shown.month} anchor={anchor} events={events} onPickDay={onPickDay} />
        </aside>
    );
}

export default MiniMonth;
