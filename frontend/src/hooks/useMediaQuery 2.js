import { useCallback, useSyncExternalStore } from "react";

// Whether `query` matches, kept current as the window is resized or rotated.
// False where matchMedia is missing (jsdom), so a test renders the desktop
// layout unless it stubs one in.
export default function useMediaQuery(query) {
    const subscribe = useCallback(
        (onChange) => {
            const list = window.matchMedia?.(query);
            list?.addEventListener?.("change", onChange);
            return () => list?.removeEventListener?.("change", onChange);
        },
        [query],
    );

    return useSyncExternalStore(subscribe, () => window.matchMedia?.(query).matches ?? false);
}
