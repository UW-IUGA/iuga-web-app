/*
 * Purpose: One underline under the current navbar link that travels to the next link instead of jumping, for the
 *          transitions that use it. Hidden on the phone menu, where the links are a list.
 * Authentication/Authorization Requirements: None.
 * Expected Request Information: The path the page area is showing.
 * Expected Response Information: An absolutely positioned bar inside the primary links.
 */
import { useLayoutEffect, useRef, useState } from "react";

function prototypeCurrentLink(container, path) {
    if (!container || !path) return null;
    const links = [...container.querySelectorAll(":scope > a[href]")];
    return links.find((link) => {
        const href = link.getAttribute("href");
        return href !== "/" && (path === href || path.startsWith(`${href}/`));
    }) || null;
}

export default function PrototypeNavIndicator({ path }) {
    const barRef = useRef(null);
    const [box, setBox] = useState(null);

    useLayoutEffect(() => {
        const container = barRef.current?.parentElement;
        if (!container) return undefined;
        const measure = () => {
            const link = prototypeCurrentLink(container, path);
            if (!link) {
                setBox((current) => (current ? { ...current, visible: false } : null));
                return;
            }
            const inset = 2; // the links' side padding, so the bar matches the text
            const next = { left: link.offsetLeft + inset, width: link.offsetWidth - inset * 2, top: link.offsetTop + link.offsetHeight - 9, visible: true };
            // Arriving from a page with no link (home), the bar appears in place rather than sliding in.
            setBox((current) => ({ ...next, instant: !current?.visible }));
        };
        measure();
        const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
        observer?.observe(container);
        return () => observer?.disconnect();
    }, [path]);

    return (
        <span
            ref={barRef}
            className={`prototypeNavIndicator${box?.visible ? " prototypeNavIndicator--visible" : ""}`}
            aria-hidden="true"
            style={box ? { transform: `translate(${box.left}px, ${box.top}px)`, width: `${box.width}px`, transition: box.instant ? "opacity 180ms ease-out" : undefined } : undefined}
        />
    );
}
