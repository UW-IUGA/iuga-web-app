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
    if (previousPath.current !== pathname) {
      window.scrollTo(
        0,
        navigationType === "POP" ? (positions.get(key) ?? 0) : 0,
      );
    }
    previousPath.current = pathname;

    // Record while this page is visible, before the next page can clamp the scroll position.
    const savePosition = () => positions.set(key, window.scrollY);
    savePosition();
    window.addEventListener("scroll", savePosition);
    return () => window.removeEventListener("scroll", savePosition);
  }, [key, pathname, navigationType]);

  return null;
}
