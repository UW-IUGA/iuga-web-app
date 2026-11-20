/*
Purpose: Open every page at its top, so pages need not do it themselves.
Authentication/Authorization Requirements: None.

Expected Request Information:
- None. Render once inside the router.

Expected Response Information:
- Renders nothing. Scrolls the window to the top when the path changes; a change to only the
  query or hash (a filter, a calendar view) keeps the visitor's place.
*/
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
    const { pathname } = useLocation();

    useEffect(() => {
        window.scrollTo(0, 0);
    }, [pathname]);

    return null;
}
