import { useRef, useState } from "react";

// Which event's popover is open in a week or day grid. Picking an event opens
// it beside its block, and picking the same block again leaves it open. The
// grid's first column opens to the right; the others open left. On a phone,
// EventPopover places it above or below the block instead.
//
// `periodKey` names the week or day on screen. Leaving that period drops the
// selection, so stepping back never brings the popover back beside a block that
// is no longer on the page.
export default function useEventPopover(periodKey) {
    const [selection, setSelection] = useState(null);
    // Set when the open popover starts to fade out. While it fades, a press on its
    // block opens it again, rather than being taken for a press on a popover that
    // is still open.
    const closingRef = useRef(false);

    // Dropped during render, not in an effect, so no frame shows a popover for a
    // period that is gone.
    if (selection && selection.periodKey !== periodKey) setSelection(null);
    const popoverSelection = selection?.periodKey === periodKey ? selection : null;

    const pickEvent = ({ event, date, columnIndex, key, el }) => {
        // Already open beside this block: leave it be rather than replaying it.
        if (popoverSelection?.key === key && !closingRef.current) return;

        closingRef.current = false;
        setSelection({
            events: [event],
            date,
            key,
            el,
            periodKey,
            // Week view's first column is Sunday, which opens into the week. A day
            // has only the one column, so it opens to the right as well.
            side: columnIndex === 0 ? "right" : "left",
        });
    };

    // Called as the fade-out starts, while the popover is still on screen.
    const beginClosing = () => {
        closingRef.current = true;
    };

    const closePopover = () => {
        closingRef.current = false;
        setSelection(null);
    };

    return { popoverSelection, pickEvent, beginClosing, closePopover };
}
