import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { formatFullDate } from "../../utils/calendar/calendar";
import { prefersReducedMotion } from "../../utils/calendar/motion";
import { placePopover } from "../../utils/calendar/popover";
import EventDetail from "./EventDetail";

/**
 * An event's detail in a small window beside it, as Google Calendar does,
 * shared by the week and month views. It grows out of the side facing the
 * event, then its contents rise in the way the year view's overlay does.
 *
 * Rendered into <body>: the grid scrolls and clips, so a popover inside it
 * would be cut off at the grid's edge. It is positioned from the event's
 * on-screen box instead, and follows it as the page or the grid scrolls.
 *
 * `selected` is `{ events, date, side, el }`, or null: one event for a click
 * on it, or a whole day's for the month view's "+N more". Whatever opens it
 * marks its trigger with `data-popover-trigger`, so a press on another
 * trigger is left to open that one rather than closing this. Closing animates out
 * first, then calls `onClose`; focus goes back to the event that opened it.
 */
function EventPopover({ selected, onClose, onViewDay }) {
    const popRef = useRef(null);
    const closeRef = useRef(null);
    const closingRef = useRef(false);

    const place = useCallback(() => {
        const pop = popRef.current;
        if (!pop || !selected) return;
        const anchor = selected.el.getBoundingClientRect();
        const { left, top } = placePopover(
            anchor,
            { width: pop.offsetWidth, height: pop.offsetHeight },
            selected.side,
            { width: window.innerWidth, height: window.innerHeight },
        );
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
    }, [selected]);

    const dismiss = useCallback(
        ({ restoreFocus = true } = {}) => {
            if (closingRef.current || !selected) return;
            closingRef.current = true;

            const finish = () => {
                closingRef.current = false;
                if (restoreFocus) selected.el.focus();
                onClose();
            };

            const pop = popRef.current;
            if (!pop || prefersReducedMotion()) {
                finish();
                return;
            }
            gsap.to(pop, { opacity: 0, scale: 0.92, duration: 0.15, ease: "power1.in", onComplete: finish });
        },
        [selected, onClose],
    );

    // Open, or re-open beside a different event: place it, then play it in.
    useLayoutEffect(() => {
        const pop = popRef.current;
        if (!pop || !selected) return undefined;
        closingRef.current = false;

        place();
        closeRef.current?.focus();

        if (!prefersReducedMotion()) {
            // Clipped while it plays. The contents start shifted down and tilted, so
            // until they settle they stick out past the popover's bottom edge, and
            // the browser counted that as overflow and flashed a scrollbar. The
            // stylesheet's scrolling comes back once they land, for a long event.
            pop.style.overflow = "hidden";

            // Grows from the edge nearest the event, so it reads as coming out of it.
            const origin = selected.side === "right" ? "left top" : "right top";
            gsap.fromTo(
                pop,
                { opacity: 0, scale: 0.85, x: selected.side === "right" ? -12 : 12, transformOrigin: origin },
                { opacity: 1, scale: 1, x: 0, duration: 0.25, ease: "power2.out" },
            );
            gsap.fromTo(
                pop.querySelectorAll(".card-item"),
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
                        pop.style.overflow = "";
                    },
                },
            );
        }

        return () => {
            gsap.killTweensOf([pop, ...pop.querySelectorAll(".card-item")]);
            // Cut short by a move to another event, or by closing: never leave it
            // clipped.
            pop.style.overflow = "";
        };
    }, [selected, place]);

    // While open: follow the event as anything scrolls (capture, to hear the
    // grid's own scroll area), and close on Escape or a press outside.
    useEffect(() => {
        if (!selected) return undefined;

        const onMove = () => requestAnimationFrame(place);
        const onKeyDown = (event) => {
            if (event.key === "Escape") dismiss();
        };
        const onPointerDown = (event) => {
            const target = event.target;
            if (popRef.current?.contains(target)) return;
            // Another trigger: its click opens that one in this popover's place, so
            // closing here would only fight it.
            if (target.closest?.("[data-popover-trigger]")) return;
            dismiss({ restoreFocus: false });
        };

        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("pointerdown", onPointerDown);
        return () => {
            window.removeEventListener("scroll", onMove, true);
            window.removeEventListener("resize", onMove);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("pointerdown", onPointerDown);
        };
    }, [selected, place, dismiss]);

    if (!selected) return null;

    const { events, date } = selected;
    // Named for its one event, or for the day when it lists several.
    const label = events.length === 1 ? events[0].name : `Events on ${formatFullDate(date)}`;

    // Portalled out of the page, so it carries its own .eventsCalendar scope:
    // the calendar's styles apply only inside one.
    return createPortal(
        <div className="eventsCalendar">
            <div ref={popRef} className={`popover popover--${selected.side}`} role="dialog" aria-label={label}>
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
                        ref={closeRef}
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
