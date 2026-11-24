/*
Purpose: The first-visit entrance flag shared by every page, and the matching
         flag for the navbar and footer, which play only on the first load.

Expected Request Information:
- duration: how long the entering class stays on (the shared wave length).
- onceKey: when set, the wave plays at most once in the session for that key.

Expected Response Information:
- true while the wave should play, then false after the duration, and false
  from the first render when a onceKey or the chrome has already played.
*/
import { useEffect, useState } from "react";
import {
    ENTRANCE_WAVE_MS,
    chromeShouldEnter,
    pageShouldEnter,
} from "../utils/pageEntrance";

function useEnteringFlag(shouldEnter, duration) {
    const [entering, setEntering] = useState(shouldEnter);

    useEffect(() => {
        if (!entering) return undefined;
        const timeout = window.setTimeout(() => setEntering(false), duration);
        return () => window.clearTimeout(timeout);
    }, [entering, duration]);

    return entering;
}

export default function usePageEntrance({
    onceKey,
    duration = ENTRANCE_WAVE_MS,
} = {}) {
    return useEnteringFlag(pageShouldEnter(onceKey), duration);
}

// The navbar and footer remount when moving between the public site and
// admin, so a module flag keeps the wave to the first load of the visit.
export function useChromeEntrance({ duration = ENTRANCE_WAVE_MS } = {}) {
    return useEnteringFlag(chromeShouldEnter(), duration);
}
