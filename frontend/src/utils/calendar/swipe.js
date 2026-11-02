// The rules a touch has to meet to count as a swipe to the previous or next
// month, week or day. Kept apart from the touch handling (useSwipeStep) so
// they can be tested without a touchscreen.

// How far a finger moves before the gesture is read as across or down. Below
// it, a touch is still a tap.
export const SWIPE_LOCK = 10;

// How far across it has to travel to step. Short of it, the view springs back.
export const SWIPE_MIN = 50;

// Swipes starting this close to either side of the screen are left alone:
// iOS Safari's own edge swipe goes back a page, and the calendar now runs
// right up to both edges.
export const SWIPE_EDGE = 24;

/**
 * Which way a moving touch is going, once it has moved far enough to say:
 * 'x' for across, 'y' for down (a scroll, which is not a swipe's business),
 * or null while it could still be a tap.
 */
export function lockAxis(dx, dy) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_LOCK) return null;
    return Math.abs(dx) > Math.abs(dy) ? "x" : "y";
}

/**
 * The step a finished swipe makes: 1 for next (the finger moved left, pulling
 * the next period in from the right), -1 for previous, 0 for too short.
 */
export function swipeStep(dx) {
    if (Math.abs(dx) < SWIPE_MIN) return 0;
    return dx < 0 ? 1 : -1;
}

/** Whether a touch at `x` starts inside the screen-edge band left to iOS. */
export function startsAtEdge(x, width) {
    return x < SWIPE_EDGE || x > width - SWIPE_EDGE;
}
