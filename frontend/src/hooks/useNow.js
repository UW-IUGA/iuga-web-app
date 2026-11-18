import { useEffect, useState } from "react";

// The now-line has to move while the page is open, but re-rendering the whole
// grid every second is wasteful for a marker that only moves meaningfully by
// the minute.
export default function useNow(intervalMs = 60_000) {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);

    return now;
}
