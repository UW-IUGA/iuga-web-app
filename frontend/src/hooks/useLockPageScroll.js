/*
 * Purpose: Stops the page behind a drawer or dialog from scrolling while it is open, without the page
 *          shifting sideways when the scrollbar goes.
 * Expected Request Information: Whether the page should be locked.
 * Expected Response Information: None; the page is restored as it was when unlocked.
 */

import { useEffect } from "react";

/*
 * @behavior While locked, the page behind the drawer or a dialog does not scroll and gives up the strip it
 *           keeps for its scrollbar, so the drawer reaches the window's edge. The page is padded by exactly
 *           the width it gained, measured rather than assumed, so the dimmed page never shifts sideways.
 *           The width is html's layout box, not clientWidth: on a list too short to scroll, clientWidth
 *           ignores the strip that scrollbar-gutter: stable still reserves, and the page jumped by its width.
 *           The lock is set on body, which hands it to the window; locking html instead would make body a
 *           scroll container and unstick the admin bar. Unlocking restores the page as it was.
 */
export function useLockPageScroll(locked) {
    useEffect(() => {
        if (!locked) return undefined;
        const root = document.documentElement;
        const { body } = document;
        const previous = { overflow: body.style.overflow, gutter: root.style.scrollbarGutter, padding: body.style.paddingRight };
        const widthBefore = root.getBoundingClientRect().width;
        body.style.overflow = "hidden";
        root.style.scrollbarGutter = "auto";
        body.style.paddingRight = `${root.getBoundingClientRect().width - widthBefore}px`;
        return () => {
            body.style.overflow = previous.overflow;
            root.style.scrollbarGutter = previous.gutter;
            body.style.paddingRight = previous.padding;
        };
    }, [locked]);
}
