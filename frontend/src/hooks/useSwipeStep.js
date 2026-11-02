import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { prefersReducedMotion } from "../utils/calendar/motion";
import { lockAxis, startsAtEdge, swipeStep } from "../utils/calendar/swipe";

// How far the view trails the finger: a little behind it, so the drag reads
// as pulling the next period in rather than moving the page.
const DRAG_RATIO = 0.6;

// How far the incoming period slides in from, in pixels.
const ENTER_OFFSET = 40;

/**
 * Swipe across the calendar to step it, as the toolbar's arrows do. The arrows
 * stay: a swipe is a path-based gesture, so WCAG 2.5.1 asks for a single-tap
 * way to do the same, and a screen reader keeps swipes for itself.
 *
 * Touch only, so a mouse or trackpad behaves as it always has. A touch that
 * turns out to be going down is a scroll, and is left to the week and day
 * grids; only one that is clearly going across is a swipe. The view follows
 * the finger, then slides the next period in. Under reduced motion it steps
 * without moving.
 *
 * `onStep(1)` is next and `onStep(-1)` previous. Nothing is bound while
 * `enabled` is false: the year view does not step.
 */
export default function useSwipeStep(ref, onStep, enabled = true) {
    // Read at release, so a fresh handler each render does not rebind the
    // listeners mid-gesture.
    const onStepRef = useRef(onStep);
    useEffect(() => {
        onStepRef.current = onStep;
    });

    useEffect(() => {
        const el = ref.current;
        if (!el || !enabled) return undefined;

        let start = null;
        let axis = null;
        let dx = 0;

        const reset = () => {
            start = null;
            axis = null;
            dx = 0;
        };

        const springBack = () => {
            gsap.to(el, { x: 0, duration: 0.2, ease: "power2.out", clearProps: "transform" });
        };

        const step = (amount) => {
            if (prefersReducedMotion()) {
                gsap.set(el, { clearProps: "transform,opacity" });
                onStepRef.current(amount);
                return;
            }

            // Out the way the finger went, then the new period in from the other side.
            gsap.to(el, {
                x: -amount * ENTER_OFFSET * 2,
                opacity: 0,
                duration: 0.12,
                ease: "power1.in",
                onComplete: () => {
                    onStepRef.current(amount);
                    gsap.fromTo(
                        el,
                        { x: amount * ENTER_OFFSET, opacity: 0 },
                        { x: 0, opacity: 1, duration: 0.2, ease: "power2.out", clearProps: "transform,opacity" },
                    );
                },
            });
        };

        // A second finger is a pinch, which is zoom, not a swipe.
        const cancel = () => {
            if (axis === "x") springBack();
            reset();
        };

        const onStart = (event) => {
            if (event.touches.length !== 1) {
                cancel();
                return;
            }
            const touch = event.touches[0];
            if (startsAtEdge(touch.clientX, window.innerWidth)) return;
            start = { x: touch.clientX, y: touch.clientY };
        };

        const onMove = (event) => {
            if (!start) return;
            if (event.touches.length !== 1) {
                cancel();
                return;
            }

            const touch = event.touches[0];
            dx = touch.clientX - start.x;
            axis ??= lockAxis(dx, touch.clientY - start.y);

            if (axis === "y") {
                reset();
                return;
            }
            if (axis === "x") {
                // Ours now: the page must not scroll or pan under it.
                event.preventDefault();
                if (!prefersReducedMotion()) gsap.set(el, { x: dx * DRAG_RATIO });
            }
        };

        const onEnd = () => {
            if (axis !== "x") {
                reset();
                return;
            }
            const amount = swipeStep(dx);
            reset();
            if (amount) step(amount);
            else springBack();
        };

        el.addEventListener("touchstart", onStart, { passive: true });
        // Not passive, so a swipe can stop the page panning under it.
        el.addEventListener("touchmove", onMove, { passive: false });
        el.addEventListener("touchend", onEnd);
        el.addEventListener("touchcancel", cancel);

        return () => {
            el.removeEventListener("touchstart", onStart);
            el.removeEventListener("touchmove", onMove);
            el.removeEventListener("touchend", onEnd);
            el.removeEventListener("touchcancel", cancel);
            gsap.killTweensOf(el);
            gsap.set(el, { clearProps: "transform,opacity" });
        };
    }, [ref, enabled]);
}
