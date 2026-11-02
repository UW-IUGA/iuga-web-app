import { useCallback, useSyncExternalStore } from "react";

// The site's colour theme, "light" or "dark", kept on <html data-theme>.
//
// A visitor's explicit choice is remembered in localStorage under
// THEME_STORAGE_KEY. Until they make one, the theme follows their system
// setting, and keeps following it if that changes while the page is open.
// A choice made in another tab applies here too.
//
// index.html applies the same rule in an inline script before the first paint,
// so the page never flashes the wrong theme; React takes over a page whose
// theme is already right. The two must agree (theme.test.js runs that script).
export const THEME_STORAGE_KEY = "iuga-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const CHANGE_EVENT = "iuga-themechange";

const isTheme = (value) => value === "light" || value === "dark";

// Storage can throw (blocked cookies, some private modes); the theme still works, unremembered.
function storedTheme() {
    try {
        const value = localStorage.getItem(THEME_STORAGE_KEY);
        return isTheme(value) ? value : null;
    } catch {
        return null;
    }
}

function systemTheme() {
    return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// The rule index.html applies at load, re-applied when its inputs change: the
// system setting, or the stored choice from another tab (a "storage" event,
// whose key is null when that tab cleared the site's data).
function syncTheme() {
    const theme = storedTheme() ?? systemTheme();
    if (theme !== currentTheme()) applyTheme(theme);
}

function syncFromStorage(event) {
    if (event.key === THEME_STORAGE_KEY || event.key === null) syncTheme();
}

function subscribe(onChange) {
    const system = window.matchMedia?.(DARK_QUERY);
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener("storage", syncFromStorage);
    system?.addEventListener?.("change", syncTheme);
    return () => {
        window.removeEventListener(CHANGE_EVENT, onChange);
        window.removeEventListener("storage", syncFromStorage);
        system?.removeEventListener?.("change", syncTheme);
    };
}

// The theme on screen, and a way to choose one. Choosing remembers it.
export function useTheme() {
    const theme = useSyncExternalStore(subscribe, currentTheme, () => "light");
    const chooseTheme = useCallback((next) => {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // Not remembered, but still applied for this visit.
        }
        applyTheme(next);
    }, []);
    return { theme, chooseTheme };
}
