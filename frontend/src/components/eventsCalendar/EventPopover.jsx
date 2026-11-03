import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { MOBILE_QUERY } from "../../utils/calendar/breakpoints";
import { formatFullDate } from "../../utils/calendar/calendar";
import { prefersReducedMotion } from "../../utils/calendar/motion";
import { placePopover, placeStacked } from "../../utils/calendar/popover";
import EventDetail from "./EventDetail";

// Shows selected events beside their trigger, following it during scrolling. On a
// phone there is no room beside it, so it goes above or below instead, and never
// over the event it belongs to. Renders in the document body so the calendar grid
// cannot clip it.
function EventPopover({ selected, onClose, onClosing, onViewDay }) {
    const popoverRef = useRef(null);
    const closeButtonRef = useRef(null);
    const closingRef = useRef(false);

    const positionPopover = useCallback(() => {
        const popover = popoverRef.current;
        if (!popover || !selected) return;
        const triggerBounds = selected.el.getBoundingClientRect();
        // The height the content asks for. scrollHeight, not offsetHeight: the
        // max-height set below would otherwise cap the very height being measured.
        const popoverSize = {
            width: popover.offsetWidth,
            height: popover.scrollHeight + (popover.offsetHeight - popover.clientHeight),
        };
        const viewportSize = {
            width: window.innerWidth,
            height: window.innerHeight,
        };
        const onPhone = window.matchMedia?.(MOBILE_QUERY).matches ?? false;
        // The site's sticky navigation. placeStacked ignores it once it has scrolled off screen.
        const headerBottom = document.querySelector(".site-navigation")?.getBoundingClientRect().bottom;
        const placed = onPhone
            ? placeStacked(triggerBounds, popoverSize, viewportSize, headerBottom)
            : placePopover(triggerBounds, popoverSize, selected.side, viewportSize);

        popover.style.left = `${placed.left}px`;
        popover.style.top = `${placed.top}px`;
        popover.style.maxHeight = placed.maxHeight === undefined ? "" : `${placed.maxHeight}px`;
    }, [selected]);

    const dismiss = useCallback(
        ({ restoreFocus = true } = {}) => {
            if (closingRef.current || !selected) return;
            closingRef.current = true;
            onClosing?.();

            const finishClosing = () => {
                closingRef.current = false;
                if (restoreFocus) selected.el.focus();
                onClose();
            };

            const popover = popoverRef.current;
            if (!popover || prefersReducedMotion()) {
                finishClosing();
                return;
            }
            gsap.to(popover, {
                opacity: 0,
                scale: 0.92,
                duration: 0.15,
                ease: "power1.in",
                onComplete: finishClosing,
            });
        },
        [selected, onClose, onClosing],
    );

    // Open, or re-open beside a different event: place it, then play it in.
    useLayoutEffect(() => {
        const popover = popoverRef.current;
        if (!popover || !selected) return undefined;
        closingRef.current = false;

        positionPopover();
        closeButtonRef.current?.focus();

        if (!prefersReducedMotion()) {
            // Clipped while it plays. The contents start shifted down and tilted, so
            // until they settle they stick out past the popover's bottom edge, and
            // the browser counted that as overflow and flashed a scrollbar. The
            // stylesheet's scrolling comes back once they land, for a long event.
            popover.style.overflow = "hidden";

            // Grows from the edge nearest the event, so it reads as coming out of it.
            const origin = selected.side === "right" ? "left top" : "right top";
            gsap.fromTo(
                popover,
                {
                    opacity: 0,
                    scale: 0.85,
                    x: selected.side === "right" ? -12 : 12,
                    transformOrigin: origin,
                },
                { opacity: 1, scale: 1, x: 0, duration: 0.25, ease: "power2.out" },
            );
            gsap.fromTo(
                popover.querySelectorAll(".card-item"),
                { y: 20, rotation: () => gsap.utils.random(-6, 6), opacity: 0 },
                {
                    y: 0,
                    rotation: 0,
                    opacity: 1,
                    duration: 0.6,
                    ease: "power2.out",
                    stagger: 0.06,
                    delay: 0.1,
                    // Fires once the last item has landed.
                    onComplete: () => {
                        popover.style.overflow = "";
                    },
                },
            );
        }

        return () => {
            gsap.killTweensOf([popover, ...popover.querySelectorAll(".card-item")]);
            // Cut short by a move to another event, or by closing: never leave it
            // clipped.
            popover.style.overflow = "";
        };
    }, [selected, positionPopover]);

    // What the popover holds can grow after it opens (its RSVP block fills in), and
    // its place depends on its height, so it is placed again whenever its size changes.
    useEffect(() => {
        const popover = popoverRef.current;
        if (!popover || !selected || typeof ResizeObserver === "undefined") return undefined;

        const observer = new ResizeObserver(() => positionPopover());
        observer.observe(popover);
        return () => observer.disconnect();
    }, [selected, positionPopover]);

    // While open: follow the event as anything scrolls (capture, to hear the
    // grid's own scroll area), and close on Escape or a press outside.
    useEffect(() => {
        if (!selected) return undefined;

        const repositionOnScrollOrResize = () => requestAnimationFrame(positionPopover);
        const onKeyDown = (event) => {
            if (event.key === "Escape") dismiss();
        };
        const onPointerDown = (event) => {
            const target = event.target;
            if (popoverRef.current?.contains(target)) return;
            // Another trigger: its click opens that one in this popover's place, so
            // closing here would only fight it.
            if (target.closest?.("[data-popover-trigger]")) return;
            dismiss({ restoreFocus: false });
        };

        window.addEventListener("scroll", repositionOnScrollOrResize, true);
        window.addEventListener("resize", repositionOnScrollOrResize);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("pointerdown", onPointerDown);
        return () => {
            window.removeEventListener("scroll", repositionOnScrollOrResize, true);
            window.removeEventListener("resize", repositionOnScrollOrResize);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("pointerdown", onPointerDown);
        };
    }, [selected, positionPopover, dismiss]);

    if (!selected) return null;

    const { events, date } = selected;
    // Named for its one event, or for the day when it lists several.
    const dialogLabel = events.length === 1 ? events[0].name : `Events on ${formatFullDate(date)}`;

    // Portalled out of the page, so it carries its own .eventsCalendar scope:
    // the calendar's styles apply only inside one.
    return createPortal(
        <div className="eventsCalendar">
            <div
                ref={popoverRef}
                className={`popover popover--${selected.side}`}
                role="dialog"
                aria-label={dialogLabel}
            >
                <div className="popover__bar card-item">
                    {/* The day view leaves out onViewDay: the day is already on screen. */}
                    {onViewDay && (
                        <button
                            type="button"
                            className="popover__button"
                            // Straight to the day view, which replaces the week and this with
                            // it, so there is nothing to animate out or hand focus back to.
                            onClick={() => {
                                onClose();
                                onViewDay(date);
                            }}
                        >
                            View day
                        </button>
                    )}
                    <button
                        ref={closeButtonRef}
                        type="button"
                        className="popover__close"
                        aria-label="Close"
                        onClick={() => dismiss()}
                    >
                        ×
                    </button>
                </div>

                <p className="popover__date card-item">{formatFullDate(date)}</p>

                {events.map((event) => (
                    <div className="card-item" key={event.id}>
                        <EventDetail event={event} headingLevel={2} />
                    </div>
                ))}
            </div>
        </div>,
        document.body,
    );
}

export default EventPopover;
