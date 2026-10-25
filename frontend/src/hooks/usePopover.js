/*
 * Purpose: Shared popover behavior: a popover that closes on a press outside it and on Escape.
 * Authentication/Authorization Requirements: None.
 * Expected Request Information: Whether the popover is open, and the function that closes it.
 * Expected Response Information: A wrapper ref for the popover's container and an Escape key handler for it.
 */

import { useEffect, useRef } from "react";

/*
 * @behavior Closes a popover on a press outside it, and on Escape inside it. Escape is prevented so the
 *           drawer around the popover stays open. Returns the wrapper ref.
 */
export function usePopover(open, close) {
    const wrapperRef = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const closeOutside = (event) => {
            if (!wrapperRef.current?.contains(event.target)) close(false);
        };
        document.addEventListener("mousedown", closeOutside);
        return () => document.removeEventListener("mousedown", closeOutside);
    }, [open, close]);

    const onKeyDown = (event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            close(true);
        }
    };
    return { wrapperRef, onKeyDown };
}
