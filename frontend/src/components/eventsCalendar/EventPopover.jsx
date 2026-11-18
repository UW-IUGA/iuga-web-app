import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import { MOBILE_QUERY } from "../../utils/calendar/breakpoints";
import { formatFullDate } from "../../utils/calendar/calendar";
import { prefersReducedMotion } from "../../utils/calendar/motion";
import { chooseSide, followAnchor, placePopover, placeStacked } from "../../utils/calendar/popover";
import EventDetail from "./EventDetail";

// Shows selected events beside their trigger, or centred over it when
// `selected.side` is "center" (the day view). On a phone there is no room beside
// it, so it goes above or below instead, and never over the event it belongs to.
// Renders in the document body so the calendar grid's scrolling cannot clip it,
// and is placed inside the calendar's box instead, so it never reaches past the
// calendar into Previous events.
//
// It is placed on the page, not the window: once open, the page carries it as it
// scrolls, as it does the event, with no script in between. Chasing each scroll
// from script lagged behind a phone's scrolling, and re-placing it as the room
// changed made it flip sides and snap to the screen.
function EventPopover({ selected, onClose, onClosing, onViewDay }) {
    const popoverRef = useRef(null);
    const closeButtonRef = useRef(null);
    const closingRef = useRef(false);
    // The side the popover landed on, which can differ from the one it was asked for.
    const placedSideRef = useRef(null);
    // Where it was placed and where its event was then, in page pixels, so it can
    // follow the event as a grid scrolls inside itself (followAnchor).
    const placementRef = useRef(null);

    // The page's corner in window pixels: the popover is positioned against the
    // box that holds it (the body), so window positions are taken from this.
    const pageOrigin = () => (popoverRef.current?.offsetParent ?? document.body).getBoundingClientRect();
    const toPage = (box, origin) => ({
        left: box.left - origin.left,
        right: box.right - origin.left,
        top: box.top - origin.top,
        bottom: box.bottom - origin.top,
    });

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
        // The site's sticky navigation: the popover stays below it, and scrolls under it.
        const headerBottom = document.querySelector(".site-navigation")?.getBoundingClientRect().bottom;
        // The calendar the event sits in: the grid and its sidebar, down to the line
        // above Previous events. The popover stays inside it, so it scrolls away with
        // the calendar rather than staying over Previous events.
        const calendarBounds = selected.el.closest(".events")?.getBoundingClientRect();
        // A side flips to the other when it has no room; centred has nowhere to flip to.
        const side =
            onPhone || selected.side === "center"
                ? selected.side
                : chooseSide(triggerBounds, popoverSize, selected.side, viewportSize);
        const placed = onPhone
            ? placeStacked(triggerBounds, popoverSize, viewportSize, headerBottom, calendarBounds)
            : placePopover(triggerBounds, popoverSize, side, viewportSize, headerBottom, calendarBounds);

        // Worked out in window pixels, where the room is judged; set in page pixels.
        const origin = pageOrigin();
        const anchorOnPage = toPage(triggerBounds, origin);
        const left = placed.left - origin.left;
        const top = placed.top - origin.top;

        placedSideRef.current = side;
        placementRef.current = {
            left,
            top,
            anchorLeft: anchorOnPage.left,
            anchorTop: anchorOnPage.top,
            height: placed.maxHeight ?? popoverSize.height,
            // What it was placed for, so a change in its own max-height is not
            // taken for new content (see the ResizeObserver below).
            contentHeight: popoverSize.height,
            width: popoverSize.width,
        };
        popover.classList.toggle("popover--right", side === "right");
        popover.classList.toggle("popover--left", side === "left");
        popover.classList.toggle("popover--center", side === "center");
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        popover.style.maxHeight = placed.maxHeight === undefined ? "" : `${placed.maxHeight}px`;
    }, [selected]);

    // A week or day grid scrolled inside itself and moved the event: the popover
    // keeps its place beside it, held inside the calendar, without being placed
    // afresh.
    const followEvent = useCallback(() => {
        const popover = popoverRef.current;
        const placement = placementRef.current;
        if (!popover || !selected || !placement) return;
        const origin = pageOrigin();
        const calendar = selected.el.closest(".events");
        const { left, top } = followAnchor(
            placement,
            toPage(selected.el.getBoundingClientRect(), origin),
            calendar ? toPage(calendar.getBoundingClientRect(), origin) : undefined,
        );
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
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
            // Centred over the event, it grows from its top middle, without a slide.
            const side = placedSideRef.current ?? selected.side;
            const GROW_FROM = {
                right: { origin: "left top", x: -12 },
                left: { origin: "right top", x: 12 },
                center: { origin: "center top", x: 0 },
            };
            const { origin, x } = GROW_FROM[side];
            gsap.fromTo(
                popover,
                {
                    opacity: 0,
                    scale: 0.85,
                    x,
                    transformOrigin: origin,
                },
                { opacity: 1, scale: 1, x: 0, duration: 0.15, ease: "power2.out" },
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
    // its place depends on its height, so it is placed again when its content or
    // width changes. Not when only the max-height it was given changed it, which
    // would place it afresh for nothing and could jump it after a scroll.
    useEffect(() => {
        const popover = popoverRef.current;
        if (!popover || !selected || typeof ResizeObserver === "undefined") return undefined;

        const observer = new ResizeObserver(() => {
            const placement = placementRef.current;
            const contentHeight = popover.scrollHeight + (popover.offsetHeight - popover.clientHeight);
            if (placement && contentHeight === placement.contentHeight && popover.offsetWidth === placement.width) {
                return;
            }
            positionPopover();
        });
        observer.observe(popover);
        return () => observer.disconnect();
    }, [selected, positionPopover]);

    // While open: follow the event when a grid scrolls inside itself (capture, to
    // hear it), place it again when the window changes width, and close on Escape
    // or a press outside.
    useEffect(() => {
        if (!selected) return undefined;

        const onScroll = (event) => {
            const scroller = event.target;
            // The page itself: the popover is on the page, so it already moves with
            // the event. Only a scroll area holding the event moves one without the other.
            if (scroller === document || scroller === document.documentElement || scroller === document.body) return;
            if (!scroller.contains?.(selected.el)) return;
            followEvent();
        };
        // Width only. A phone's address bar showing or hiding as the page scrolls
        // changes the window's height, and placing the popover afresh then made it jump.
        let lastWidth = window.innerWidth;
        const onResize = () => {
            if (window.innerWidth === lastWidth) return;
            lastWidth = window.innerWidth;
            positionPopover();
        };
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

        window.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("pointerdown", onPointerDown);
        return () => {
            window.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("pointerdown", onPointerDown);
        };
    }, [selected, positionPopover, followEvent, dismiss]);

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
                    {/* The day view leaves out onViewDay: the day is already on screen.
                        The date then moves up beside Close, rather than leaving the bar
                        empty above it. */}
                    {onViewDay ? (
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
                    ) : (
                        <p className="popover__date">{formatFullDate(date)}</p>
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

                {onViewDay && <p className="popover__date card-item">{formatFullDate(date)}</p>}

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
