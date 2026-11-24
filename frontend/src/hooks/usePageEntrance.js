/*
Purpose: The first-visit entrance flag shared by every page, and the matching
         flag for the navbar and footer, which play only on the first load.

Expected Request Information:
- duration: how long the entering class stays on (the shared wave length).
- onceKey: identifies the page so the wave plays at most once in the session.
- ready: when false, the clock has not started and the class stays off, so
  a later first paint of the real content can include the hidden start state.

Expected Response Information:
- true while the wave should play, then false after the duration, and false
  from the first render when this onceKey has already played.
*/
import { useEffect, useState } from "react";
import {
    ENTRANCE_WAVE_MS,
    chromeShouldEnter,
    pageShouldEnter,
    waveIsPlaying,
    waveRemainingMs,
} from "../utils/pageEntrance";

function useEnteringFlag(isEntering, duration, startKey) {
    const [, tick] = useState(0);

    useEffect(() => {
        if (!isEntering) return undefined;
        const timeout = window.setTimeout(
            () => tick((count) => count + 1),
            waveRemainingMs(startKey, duration),
        );
        return () => window.clearTimeout(timeout);
    }, [isEntering, duration, startKey]);

    return isEntering;
}

export default function usePageEntrance({
    onceKey,
    duration = ENTRANCE_WAVE_MS,
    ready = true,
} = {}) {
    if (onceKey == null || onceKey === "") {
        throw new Error("usePageEntrance requires a onceKey so a remount cannot restart the wave");
    }
    const entering = ready ? pageShouldEnter(onceKey, duration) : waveIsPlaying(onceKey, duration);
    return useEnteringFlag(entering, duration, onceKey);
}

// The navbar and footer remount when moving between the public site and
// admin, so a module clock keeps the wave to the first load of the visit.
export function useChromeEntrance({ duration = ENTRANCE_WAVE_MS } = {}) {
    return useEnteringFlag(chromeShouldEnter(duration), duration, "chrome");
}
