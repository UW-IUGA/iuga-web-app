// Space between the event and the popover, and between the popover and the
// edge of the window.
const GAP = 8;
const EDGE = 16;

// Where the popover's left edge would go on each side of `anchor`, before it is
// kept inside the window. "center" is over the middle of `anchor`: the day
// view's events run the width of the grid, with no room beside them.
const IDEAL_LEFT = {
    right: (anchor) => anchor.right + GAP,
    left: (anchor, popover) => anchor.left - GAP - popover.width,
    center: (anchor, popover) => (anchor.left + anchor.right - popover.width) / 2,
};

/**
 * Where the popover goes, in viewport pixels, beside `anchor` on `side`
 * ("right" or "left"), or centred over it ("center"), level with its top.
 * Kept inside the window: a popover that would run off the edge slides back
 * in, overlapping the grid rather than being cut off.
 */
export function placePopover(anchor, popover, side, viewport) {
    const ideal = IDEAL_LEFT[side](anchor, popover);
    const maxLeft = viewport.width - EDGE - popover.width;
    const maxTop = viewport.height - EDGE - popover.height;

    return {
        left: Math.max(EDGE, Math.min(ideal, maxLeft)),
        top: Math.max(EDGE, Math.min(anchor.top, maxTop)),
    };
}

/**
 * The side the popover opens on: the preferred side when the whole popover fits
 * there, else the other side when it fits, else whichever side has more room.
 * A side is only chosen whole-fit when one exists, so the popover never sits over
 * the event it belongs to.
 */
export function chooseSide(anchor, popover, preferred, viewport) {
    const room = {
        right: viewport.width - EDGE - (anchor.right + GAP),
        left: anchor.left - GAP - EDGE,
    };
    const other = preferred === "right" ? "left" : "right";

    if (room[preferred] >= popover.width) return preferred;
    if (room[other] >= popover.width) return other;
    return room.right >= room.left ? "right" : "left";
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
