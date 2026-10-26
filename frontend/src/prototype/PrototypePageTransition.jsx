/*
 * Purpose: Runs the chosen page-to-page transition (see prototypePageTransitions) around the routed page only, so
 *          the navbar and footer stay put. Every version opens the new page at the top and moves focus to its
 *          main heading; reduced motion swaps pages instantly. Query-only changes (the events calendar's views)
 *          never animate.
 * Authentication/Authorization Requirements: None.
 * Expected Request Information: The router location.
 * Expected Response Information: The location to render routes at, and the stage wrapping them.
 */
import { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
    prototypeCanViewTransition,
    prototypeDirection,
    prototypeEnterAnimation,
    prototypePrefersReducedMotion,
    prototypeTransition,
    prototypeTransitionVersion,
} from "./prototypePageTransitions";

// The path the page area is showing, which lags the address bar while a view transition captures the old page.
const PrototypeShownPathContext = createContext(null);
export function usePrototypeShownPath() {
    return useContext(PrototypeShownPathContext);
}

// The new page opens at the top with focus on its heading, so screen readers announce where they landed.
function prototypeSettlePage(stage) {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    if (!stage) return;
    const title = stage.querySelector("h1");
    title?.setAttribute("data-prototype-title", "");
    const heading = title || stage;
    if (!heading.hasAttribute("tabindex")) {
        heading.setAttribute("tabindex", "-1");
        heading.setAttribute("data-prototype-heading", "");
    }
    heading.focus({ preventScroll: true });
}

export function usePrototypePageTransition(location) {
    const version = prototypeTransitionVersion();
    const transition = prototypeTransition(version);
    const stageRef = useRef(null);
    const animationRef = useRef(null);
    const latestRef = useRef(location);
    const previousPathRef = useRef(location.pathname);
    const [shown, setShown] = useState(location);
    latestRef.current = location;

    const capturesOldPage = Boolean(transition?.viewTransition) && prototypeCanViewTransition() && !prototypePrefersReducedMotion();
    const routesLocation = capturesOldPage && shown.pathname !== location.pathname ? shown : location;

    useLayoutEffect(() => {
        if (!transition) return undefined;
        if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
        return undefined;
    }, [transition]);

    useLayoutEffect(() => {
        if (!transition) return;
        const from = previousPathRef.current;
        const to = location.pathname;
        if (from === to) {
            if (shown !== location) setShown(location);
            return;
        }
        previousPathRef.current = to;
        animationRef.current?.cancel();
        const root = document.documentElement;

        if (capturesOldPage) {
            // A newer click skips the running transition; its update still runs, so pages never stack.
            root.dataset.prototypeTransition = transition.name;
            stageRef.current?.querySelector("h1")?.setAttribute("data-prototype-title", "");
            const viewTransition = document.startViewTransition(() => {
                flushSync(() => setShown(latestRef.current));
                prototypeSettlePage(stageRef.current);
            });
            viewTransition.finished.finally(() => {
                if (previousPathRef.current === to) delete root.dataset.prototypeTransition;
            });
            return;
        }

        setShown(location);
        prototypeSettlePage(stageRef.current);
        if (prototypePrefersReducedMotion()) return;
        const enter = prototypeEnterAnimation(transition.enter || transition.fallback, prototypeDirection(from, to));
        if (enter && stageRef.current?.animate) {
            animationRef.current = stageRef.current.animate(enter.keyframes, enter.options);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location]);

    return { version, transition, stageRef, routesLocation };
}

// Wraps the routed page in a stage that carries the animation. Without a version it renders the page as before.
export function PrototypePageStage({ transition, stageRef, children }) {
    if (!transition) return children;
    return (
        <div ref={stageRef} className={`prototypePageStage prototypePageStage--${transition.name}`}>
            {children}
        </div>
    );
}

export { PrototypeShownPathContext };
