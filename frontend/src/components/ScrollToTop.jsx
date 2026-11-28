/*
Purpose: Start new pages at the top. When visitors go back or forward, return them to where they left off.
Authentication/Authorization Requirements: None.

Expected Request Information:
- None. Render once inside the router.

Expected Response Information:
- Renders nothing. New pages open at the top; Back and Forward restore the saved scroll
  position across pages. Changes to only the query or hash keep the visitor's place.
*/
import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

const RESTORE_TIMEOUT_MS = 2000;
const USER_INPUT_EVENTS = ["wheel", "touchstart", "keydown", "mousedown"];

export default function ScrollToTop() {
  const { key, pathname } = useLocation();
  const navigationType = useNavigationType();
  const previousPath = useRef(pathname);
  const scrollPositions = useRef(new Map());

  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);

  useLayoutEffect(() => {
    const positions = scrollPositions.current;
    let restoring = false;
    let frame = null;

    const stopRestoring = () => {
      restoring = false;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      USER_INPUT_EVENTS.forEach((name) => window.removeEventListener(name, stopRestoring));
    };

    // While a restore is pending, the scroll position is clamped by a page that has not loaded yet, so it is not a spot to remember.
    const savePosition = () => {
      if (!restoring) positions.set(key, window.scrollY);
    };

    if (previousPath.current !== pathname) {
      const savedY = navigationType === "POP" ? positions.get(key) : undefined;
      if (savedY === undefined) {
        window.scrollTo(0, 0);
      } else {
        // A page can load its content after mounting, so the saved spot may not fit yet. Keep trying until it does, the visitor scrolls, or time runs out.
        restoring = true;
        USER_INPUT_EVENTS.forEach((name) => window.addEventListener(name, stopRestoring, { passive: true }));
        const deadline = performance.now() + RESTORE_TIMEOUT_MS;
        const attempt = () => {
          window.scrollTo(0, savedY);
          if (Math.abs(window.scrollY - savedY) < 1 || performance.now() >= deadline) {
            stopRestoring();
            return;
          }
          frame = window.requestAnimationFrame(attempt);
        };
        attempt();
      }
    }
    previousPath.current = pathname;

    savePosition();
    window.addEventListener("scroll", savePosition);
    return () => {
      stopRestoring();
      window.removeEventListener("scroll", savePosition);
    };
  }, [key, pathname, navigationType]);

  return null;
}
