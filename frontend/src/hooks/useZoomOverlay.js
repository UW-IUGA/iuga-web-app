import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { prefersReducedMotion } from "../utils/calendar/motion";

// Used when the card cannot be measured (jsdom, or a detached node). Enough to
// cover a year view card from any of its pads.
const FALLBACK_SCALE = 20;

// The uniform scale at which `el`, grown about its own centre, covers the card
// that holds it. Measured rather than fixed, since a pad's distance to the
// card's far corner depends on where it sits and how wide the card is.
function coverScale(el) {
    const card = el.closest(".card");
    const pad = el.getBoundingClientRect();
    if (!card || !pad.width || !pad.height) return FALLBACK_SCALE;

    const box = card.getBoundingClientRect();
    const cx = pad.left + pad.width / 2;
    const cy = pad.top + pad.height / 2;
    const reachX = Math.max(cx - box.left, box.right - cx);
    const reachY = Math.max(cy - box.top, box.bottom - cy);

    // A little over, so a rounding error never leaves a sliver at the edge.
    return Math.max((reachX * 2) / pad.width, (reachY * 2) / pad.height) * 1.05;
}

/**
 * The year card's zoom-open: a painted day pad grows until it fills the card,
 * then the overlay fades in and its `.card-item`s rise in over it. Closing
 * runs the same thing backwards and hands focus back to the pad.
 *
 * `openFrom(el, payload)` starts it, with `el` the pad that grows.
 *
 * The caller renders the overlay with `contentRef` on it, `onKeyDown` for
 * Escape, and `backRef` on the control that should take focus when it opens.
 */
export default function useZoomOverlay() {
    const contentRef = useRef(null);
    const backRef = useRef(null);
    // What grows, and gets focus back on close.
    const zoomRef = useRef(null);
    // Its own corner radius, to grow back into on close.
    const radiusRef = useRef(null);
    const returnFocusRef = useRef(null);
    const closingRef = useRef(false);
    const [open, setOpen] = useState(null);

    const openFrom = (el, payload) => {
        zoomRef.current = el;
        radiusRef.current = getComputedStyle(el).borderRadius;
        el.style.zIndex = "1";
        setOpen(payload);
    };

    // Runs after the overlay's content is in the DOM, so the stagger has items
    // to find and the back control exists to take focus.
    useLayoutEffect(() => {
        if (!open) {
            // The grid is only focusable again once `inert` is off, which is this
            // commit — focusing in the close handler itself would be a no-op.
            returnFocusRef.current?.focus();
            returnFocusRef.current = null;
            return;
        }

        const el = zoomRef.current;
        const content = contentRef.current;
        const items = content.querySelectorAll(".card-item");
        // Square corners as it grows. The pad's small radius is scaled with it,
        // and at 17x a 7px corner became a curve of about 120px — far rounder
        // than the card's own corners — so the card showed through at all four
        // of them. Square, the scaled pad covers the card edge to edge, and the
        // card's own rounded clip gives the result its corners.
        const grow = { scale: coverScale(el), borderRadius: 0 };

        // Reduced motion still fills the card with the colour, because the
        // overlay is designed to sit on it. It just arrives without moving.
        if (prefersReducedMotion()) {
            gsap.set(el, grow);
            gsap.set(content, { opacity: 1, pointerEvents: "all" });
        } else {
            gsap.to(el, { ...grow, duration: 0.25 });
            gsap.to(content, {
                opacity: 1,
                pointerEvents: "all",
                duration: 0.075,
                delay: 0.25,
                onStart: () =>
                    gsap.fromTo(
                        items,
                        { y: 50, rotation: () => gsap.utils.random(-20, 20), opacity: 0 },
                        { y: 0, rotation: 0, opacity: 1, duration: 1, ease: "power2.out", stagger: 0.1 },
                    ),
            });
        }

        backRef.current?.focus();
    }, [open]);

    useEffect(() => () => gsap.killTweensOf([zoomRef.current, contentRef.current]), []);

    const close = () => {
        if (closingRef.current) return;
        closingRef.current = true;

        const el = zoomRef.current;
        const content = contentRef.current;
        const shrink = { scale: 1, zIndex: 0, borderRadius: radiusRef.current };

        const finish = () => {
            // Hand the corners back to the stylesheet rather than leaving them
            // pinned inline.
            gsap.set(el, { clearProps: "borderRadius" });
            closingRef.current = false;
            returnFocusRef.current = el;
            setOpen(null);
        };

        if (prefersReducedMotion()) {
            gsap.set(content, { opacity: 0, pointerEvents: "none" });
            gsap.set(el, shrink);
            finish();
            return;
        }

        gsap.to(content, {
            opacity: 0,
            pointerEvents: "none",
            duration: 0.2,
            onComplete: () => gsap.to(el, { ...shrink, duration: 0.3, onComplete: finish }),
        });
    };

    const onKeyDown = (event) => {
        if (event.key === "Escape") {
            event.stopPropagation();
            close();
        }
    };

    return { open, openFrom, close, onKeyDown, contentRef, backRef };
}
