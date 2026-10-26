/*
 * Purpose: Page-to-page transitions for the public site, one per version (?v=1 … ?v=5) so they can be compared.
 *          Without the v parameter nothing here runs and the site behaves exactly as before.
 * Authentication/Authorization Requirements: None.
 * Expected Request Information: The v query parameter on the first page load.
 * Expected Response Information: The chosen transition, read by the route stage and the nav indicator.
 */

// The public pages in navbar order, so a directional slide knows which way a page lies.
export const PROTOTYPE_NAV_ORDER = ["/", "/events", "/resources", "/student-voice", "/shop", "/about", "/get-involved"];

// House easing (the theme toggle and cart pop use it): a quick start that settles gently.
const EASE_OUT = "cubic-bezier(0.2, 0.8, 0.2, 1)";

export const PROTOTYPE_TRANSITIONS = {
    1: { name: "crossfade", viewTransition: true, fallback: "fade" },
    2: { name: "rise", enter: "rise" },
    3: { name: "underline", enter: "fade", navIndicator: true },
    4: { name: "slide", enter: "slide" },
    5: { name: "morph", viewTransition: true, fallback: "rise", navIndicator: true },
};

// Read once from the page that was opened, so in-site links (which drop the query) keep the same version.
let prototypeVersion;
export function prototypeTransitionVersion(search = typeof window === "undefined" ? "" : window.location.search) {
    if (prototypeVersion === undefined) {
        const value = new URLSearchParams(search).get("v");
        prototypeVersion = PROTOTYPE_TRANSITIONS[value] ? Number(value) : 0;
    }
    return prototypeVersion;
}
export function resetPrototypeTransitionVersion() {
    prototypeVersion = undefined;
}

export function prototypeTransition(version = prototypeTransitionVersion()) {
    return PROTOTYPE_TRANSITIONS[version] || null;
}

function prototypeNavIndex(pathname) {
    const top = `/${pathname.split("/")[1] || ""}`;
    return PROTOTYPE_NAV_ORDER.indexOf(top);
}

// 1 when the new page sits to the right of the old one in the navbar, -1 to the left, 0 when unrelated.
export function prototypeDirection(fromPath, toPath) {
    const from = prototypeNavIndex(fromPath);
    const to = prototypeNavIndex(toPath);
    if (from < 0 || to < 0 || from === to) return 0;
    return to > from ? 1 : -1;
}

export function prototypePrefersReducedMotion() {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function prototypeCanViewTransition() {
    return typeof document !== "undefined" && typeof document.startViewTransition === "function";
}

// Keyframes for the entering page; the old page is already gone, so nothing waits on an exit.
export function prototypeEnterAnimation(kind, direction = 0) {
    switch (kind) {
        case "fade":
            return { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 180, easing: "ease-out" } };
        case "rise":
            return {
                keyframes: [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
                options: { duration: 240, easing: EASE_OUT },
            };
        case "slide":
            if (!direction) return prototypeEnterAnimation("fade");
            return {
                keyframes: [{ opacity: 0, transform: `translateX(${direction * 32}px)` }, { opacity: 1, transform: "none" }],
                options: { duration: 240, easing: EASE_OUT },
            };
        default:
            return null;
    }
}
