import { useEffect, useState } from "react";

// True from the first time half of the element is on screen, and from then on.
// Stays false where IntersectionObserver is missing (jsdom).
export default function useSeenOnce(ref) {
    const [seen, setSeen] = useState(false);

    useEffect(() => {
        const node = ref.current;
        if (!node || typeof IntersectionObserver === "undefined") return undefined;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                setSeen(true);
                observer.disconnect();
            },
            { threshold: 0.5 },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [ref]);

    return seen;
}
