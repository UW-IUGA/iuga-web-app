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

/**
 * Where the popover goes on a phone, where there is no room beside the event:
 * above or below it, so it never covers the event it belongs to. It takes the
 * side that has room for it whole, or else the side with more room, and is cut
 * to that room (`maxHeight`) so it scrolls inside rather than running off.
 * `headerBottom` is where a sticky header above the page ends: the popover
 * starts below it rather than covering it.
 */
export function placeStacked(anchor, popover, viewport, headerBottom = 0) {
    const minTop = headerBottom > 0 ? headerBottom + GAP : EDGE;
    const roomBelow = viewport.height - anchor.bottom - GAP - EDGE;
    const roomAbove = anchor.top - GAP - minTop;
    const fitsBelow = popover.height <= roomBelow;
    const fitsAbove = popover.height <= roomAbove;
    const below = fitsBelow || (!fitsAbove && roomBelow >= roomAbove);

    const height = Math.max(0, Math.min(popover.height, below ? roomBelow : roomAbove));
    const top = below ? anchor.bottom + GAP : anchor.top - GAP - height;

    return {
        left: Math.max(EDGE, Math.min(anchor.left, viewport.width - EDGE - popover.width)),
        top: Math.max(minTop, Math.min(top, viewport.height - EDGE - height)),
        ...(height < popover.height ? { maxHeight: height } : {}),
    };
}
