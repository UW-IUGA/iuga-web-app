// Space between the event and the popover, and between the popover and the
// edge of the window.
const GAP = 8;
const EDGE = 16;

// No calendar to stay inside: only the window limits the popover.
const UNBOUNDED = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };

// `bounds` is the calendar's box in viewport pixels: the grid and its sidebar,
// down to the line above Previous events. The popover stays inside it. Its
// bottom edge outranks the window: once the page scrolls on to Previous events,
// the popover leaves with the calendar rather than staying pinned on screen
// over them.

// The highest the popover may start on screen: under the sticky site navigation
// while it is in view (`headerBottom`), else a small margin from the window's top.
// The popover never covers the navigation.
const screenTop = (headerBottom) => (headerBottom > 0 ? headerBottom + GAP : EDGE);

// The popover's height, cut to the calendar's and to the window's room under the
// navigation when it would not fit inside them.
const containedHeight = (popover, viewport, headerBottom, bounds) =>
    Math.max(
        0,
        Math.min(popover.height, bounds.bottom - bounds.top, viewport.height - EDGE - screenTop(headerBottom)),
    );

// A left edge kept inside both the window and the calendar.
function containLeft(ideal, width, viewport, bounds) {
    const minLeft = Math.max(EDGE, bounds.left);
    const maxLeft = Math.min(viewport.width - EDGE, bounds.right) - width;
    return Math.max(minLeft, Math.min(ideal, maxLeft));
}

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
 * Kept inside the window and the calendar (`bounds`), and below the sticky site
 * navigation (`headerBottom`): a popover that would run off an edge slides back
 * in, overlapping the grid rather than being cut off. One taller than that room
 * is cut to it (`maxHeight`) and scrolls inside.
 */
export function placePopover(anchor, popover, side, viewport, headerBottom = 0, bounds = UNBOUNDED) {
    const height = containedHeight(popover, viewport, headerBottom, bounds);

    // Lifted off the window's bottom, held below the navigation and the
    // calendar's top, and last of all kept above the calendar's bottom edge,
    // which wins: past it, the popover goes up under the navigation with the page.
    const lifted = Math.min(anchor.top, viewport.height - EDGE - height);
    const onScreen = Math.max(screenTop(headerBottom), bounds.top, lifted);

    return {
        left: containLeft(IDEAL_LEFT[side](anchor, popover), popover.width, viewport, bounds),
        top: Math.min(onScreen, bounds.bottom - height),
        ...(height < popover.height ? { maxHeight: height } : {}),
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
 * starts below it rather than covering it. The room on either side stops at
 * the calendar's edges (`bounds`) too, and its bottom edge wins over the
 * window, as in placePopover.
 */
export function placeStacked(anchor, popover, viewport, headerBottom = 0, bounds = UNBOUNDED) {
    const minTop = Math.max(screenTop(headerBottom), bounds.top);
    const floor = Math.min(viewport.height - EDGE, bounds.bottom);
    const roomBelow = floor - anchor.bottom - GAP;
    const roomAbove = anchor.top - GAP - minTop;
    const fitsBelow = popover.height <= roomBelow;
    const fitsAbove = popover.height <= roomAbove;
    const below = fitsBelow || (!fitsAbove && roomBelow >= roomAbove);

    const height = Math.max(0, Math.min(popover.height, below ? roomBelow : roomAbove));
    const top = below ? anchor.bottom + GAP : anchor.top - GAP - height;

    return {
        left: containLeft(anchor.left, popover.width, viewport, bounds),
        top: Math.min(Math.max(minTop, Math.min(top, floor - height)), bounds.bottom - height),
        ...(height < popover.height ? { maxHeight: height } : {}),
    };
}

/**
 * Where an open popover goes when its event moves without the page scrolling:
 * the week and day grids scroll inside themselves. `placement` is where it was
 * put beside `anchorAt` when it opened. It keeps that place relative to the
 * event, held inside the calendar (`bounds`), without choosing its side or
 * height again: re-running those rules as the event moved made it jump between
 * above and below, and snap to the screen. All boxes in the same coordinates.
 */
export function followAnchor(placement, anchor, bounds = UNBOUNDED) {
    const top = placement.top + (anchor.top - placement.anchorTop);
    return {
        left: placement.left + (anchor.left - placement.anchorLeft),
        top: Math.min(Math.max(top, bounds.top), bounds.bottom - placement.height),
    };
}
