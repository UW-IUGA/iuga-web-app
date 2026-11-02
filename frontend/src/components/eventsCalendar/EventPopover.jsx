import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { formatFullDate } from "../../utils/calendar/calendar";
import { prefersReducedMotion } from "../../utils/calendar/motion";
import { placePopover } from "../../utils/calendar/popover";
import EventDetail from "./EventDetail";

// Shows selected events beside their trigger, following it during scrolling.
// Renders in the document body so the calendar grid cannot clip it.
function EventPopover({ selected, onClose, onViewDay }) {
    const popoverRef = useRef(null);
    const closeButtonRef = useRef(null);
    const closingRef = useRef(false);

    const positionPopover = useCallback(() => {
        const popover = popoverRef.current;
        if (!popover || !selected) return;
        const triggerBounds = selected.el.getBoundingClientRect();
        const { left, top } = placePopover(
            triggerBounds,
            { width: popover.offsetWidth, height: popover.offsetHeight },
            selected.side,
            { width: window.innerWidth, height: window.innerHeight },
        );
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
    }, [selected]);

    const dismiss = useCallback(
        ({ restoreFocus = true } = {}) => {
            if (closingRef.current || !selected) return;
            closingRef.current = true;

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
            gsap.to(popover, { opacity: 0, scale: 0.92, duration: 0.15, ease: "power1.in", onComplete: finishClosing });
        },
        [selected, onClose],
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
                { opacity: 0, scale: 0.85, x: selected.side === "right" ? -12 : 12, transformOrigin: origin },
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
