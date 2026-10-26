/*
 * Purpose: Verify the script index.html runs before the first paint picks the theme React will find.
 * Authentication/Authorization Requirements: None.
 * Expected Request Information: Runs index.html's inline theme script against a stubbed storage and system setting.
 * Expected Response Information: Asserts the theme it leaves on <html>.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { THEME_STORAGE_KEY } from "./theme";

const html = readFileSync(resolve(dirname(new URL(import.meta.url).pathname), "../../index.html"), "utf8");
const bootScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
const root = document.documentElement;

function boot({ stored, system }) {
    localStorage.clear();
    if (stored !== undefined) localStorage.setItem(THEME_STORAGE_KEY, stored);
    window.matchMedia = (query) => ({ matches: query === "(prefers-color-scheme: dark)" && system === "dark" });
    delete root.dataset.theme;
    new Function(bootScript)();
    return root.dataset.theme;
}

afterEach(() => {
    delete window.matchMedia;
    delete root.dataset.theme;
    vi.restoreAllMocks();
});

describe("the theme script in index.html", () => {
    test("runs before the app's own script, so the first paint is already themed", () => {
        expect(bootScript).toBeDefined();
        expect(html.indexOf(bootScript)).toBeLessThan(html.indexOf('type="module"'));
    });

    test.each([
        ["no choice, light system", { system: "light" }, "light"],
        ["no choice, dark system", { system: "dark" }, "dark"],
        ["chose dark on a light system", { stored: "dark", system: "light" }, "dark"],
        ["chose light on a dark system", { stored: "light", system: "dark" }, "light"],
        ["an unknown stored value", { stored: "sepia", system: "dark" }, "dark"],
    ])("%s", (_name, visitor, expected) => {
        expect(boot(visitor)).toBe(expected);
    });

    test("falls back to the system setting when storage is blocked", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError");
        });
        expect(boot({ system: "dark" })).toBe("dark");
    });

    test("uses the storage key the switch writes", () => {
        expect(bootScript).toContain(`"${THEME_STORAGE_KEY}"`);
    });
});
