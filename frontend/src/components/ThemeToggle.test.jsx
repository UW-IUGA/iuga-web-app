/*
 * Purpose: Verify the navbar's light/dark switch: what it shows, what it changes, and what it remembers.
 * Authentication/Authorization Requirements: None.
 * Expected Request Information: Renders the switch against a stubbed system colour preference.
 * Expected Response Information: Asserts the page's theme, the switch's state, and the stored choice.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ThemeToggle from "./ThemeToggle";
import { THEME_STORAGE_KEY } from "../utils/theme";

const root = document.documentElement;

// A system colour preference the test can change while the page is open.
function stubSystemTheme(initial) {
    const listeners = new Set();
    const system = { dark: initial === "dark" };
    window.matchMedia = (query) => ({
        media: query,
        get matches() {
            return query === "(prefers-color-scheme: dark)" && system.dark;
        },
        addEventListener: (_type, listener) => listeners.add(listener),
        removeEventListener: (_type, listener) => listeners.delete(listener),
    });
    return {
        change(theme) {
            system.dark = theme === "dark";
            act(() => listeners.forEach((listener) => listener()));
        },
    };
}

// The page as index.html leaves it before React starts.
function startPage(theme) {
    root.dataset.theme = theme;
}

const toggle = () => screen.getByRole("switch", { name: "Dark theme" });

beforeEach(() => {
    localStorage.clear();
    stubSystemTheme("light");
});

afterEach(() => {
    delete window.matchMedia;
    delete root.dataset.theme;
});

describe("ThemeToggle", () => {
    test("switches the site to dark and remembers the choice", () => {
        startPage("light");
        render(<ThemeToggle />);

        fireEvent.click(toggle());

        expect(root.dataset.theme).toBe("dark");
        expect(toggle()).toHaveAttribute("aria-checked", "true");
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    });

    test("shows the theme the page started in", () => {
        startPage("dark");
        render(<ThemeToggle />);

        expect(toggle()).toHaveAttribute("aria-checked", "true");
    });

    test("switches back to light", () => {
        startPage("dark");
        render(<ThemeToggle />);

        fireEvent.click(toggle());

        expect(root.dataset.theme).toBe("light");
        expect(toggle()).toHaveAttribute("aria-checked", "false");
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    });

    test("follows the system setting while the visitor has not chosen", () => {
        const system = stubSystemTheme("light");
        startPage("light");
        render(<ThemeToggle />);

        system.change("dark");

        expect(root.dataset.theme).toBe("dark");
        expect(toggle()).toHaveAttribute("aria-checked", "true");
    });

    test("keeps the visitor's choice when the system setting changes", () => {
        const system = stubSystemTheme("light");
        startPage("light");
        render(<ThemeToggle />);

        fireEvent.click(toggle());
        fireEvent.click(toggle());
        system.change("dark");

        expect(root.dataset.theme).toBe("light");
    });

    test("still switches when the browser blocks storage", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError");
        });
        startPage("light");
        render(<ThemeToggle />);

        fireEvent.click(toggle());

        expect(root.dataset.theme).toBe("dark");
        vi.restoreAllMocks();
    });
    test("follows a choice made in another tab of the site", () => {
        startPage("light");
        render(<ThemeToggle />);

        localStorage.setItem(THEME_STORAGE_KEY, "dark");
        act(() => window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY, newValue: "dark" })));

        expect(root.dataset.theme).toBe("dark");
        expect(toggle()).toHaveAttribute("aria-checked", "true");
    });

    test("goes back to the system setting when another tab clears site data", () => {
        startPage("dark");
        render(<ThemeToggle />);

        act(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));

        expect(root.dataset.theme).toBe("light");
    });
});
