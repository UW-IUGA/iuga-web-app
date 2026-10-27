// Space between the event and the popover, and between the popover and the
// edge of the window.
const GAP = 8;
const EDGE = 16;

/**
 * Where the popover goes, in viewport pixels, beside `anchor` on `side`.
 * Kept inside the window: a popover that would run off the edge slides back
 * in, overlapping the grid rather than being cut off.
 */
export function placePopover(anchor, popover, side, viewport) {
    const ideal = side === "right" ? anchor.right + GAP : anchor.left - GAP - popover.width;
    const maxLeft = viewport.width - EDGE - popover.width;
    const maxTop = viewport.height - EDGE - popover.height;

    return {
        left: Math.max(EDGE, Math.min(ideal, maxLeft)),
        top: Math.max(EDGE, Math.min(anchor.top, maxTop)),
    };
}
