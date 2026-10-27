import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import * as sass from "sass";

// The site's colour roles (abstracts/theme) as the compiled stylesheet ships
// them. Sass passes an unknown function call through as plain CSS, so a partial
// that forgets to load the theme module would print "theme(...)" into the
// stylesheet and the browser would drop the declaration without a word.

const css = sass.compile(resolve(dirname(new URL(import.meta.url).pathname), "main.scss")).css;

function rule(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const body = css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`))?.[1];
    if (!body) throw new Error(`no rule for ${selector}`);
    return Object.fromEntries([...body.matchAll(/(--[\w-]+|color-scheme):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

const light = rule(":root,\n[data-theme=light]");
const dark = rule("[data-theme=dark]");
const roles = (declarations) => Object.keys(declarations).filter((name) => name.startsWith("--color-"));

describe("site theme stylesheet", () => {
    it("leaves no theme() or theme-alpha() call unresolved", () => {
        expect(css.match(/(?<![-\w])theme(?:-alpha)?\([^)]*\)/g) ?? []).toEqual([]);
    });

    it("writes every colour so browsers without relative colour syntax or color-mix() still paint it", () => {
        expect(css.match(/rgb\(from|color-mix\(/g) ?? []).toEqual([]);
    });

    it("sets the same colour roles in light and dark", () => {
        expect(roles(dark).sort()).toEqual(roles(light).sort());
        expect(roles(light).length).toBeGreaterThan(20);
    });

    it("declares every colour role the stylesheet reads", () => {
        const read = new Set([...css.matchAll(/var\((--color-[\w-]+)/g)].map(([, name]) => name));
        expect([...read].filter((name) => !(name in light))).toEqual([]);
    });

    it("unsets the dark-only roles in light, so each falls back to the light value written beside it", () => {
        const darkOnly = roles(light).filter((name) => light[name] === "initial");
        expect(darkOnly.length).toBeGreaterThan(0);
        for (const name of darkOnly) expect(dark[name]).not.toBe("initial");
        for (const [, name, fallback] of css.matchAll(/var\((--color-[\w-]+)(?:,\s*([^)]+))?\)/g)) {
            if (darkOnly.includes(name)) expect(fallback, `${name} needs a light fallback`).toBeTruthy();
        }
    });

    it("tells the browser which scheme each theme is, for form controls and scrollbars", () => {
        expect(light["color-scheme"]).toBe("light");
        expect(dark["color-scheme"]).toBe("dark");
    });

    it("lets a page pinned light (the officer tools) turn the whole window light, scrollbar included", () => {
        const pinned = rule(":root:has(#rootContainer[data-theme=light])");
        expect(pinned["color-scheme"]).toBe("light");
        for (const name of roles(light)) expect(pinned[name], name).toBe(light[name]);
    });

    it("keeps the light page white and makes the dark page Andy's #1a1a1a", () => {
        expect(light["--color-page"]).toBe("#fff");
        expect(dark["--color-page"]).toBe("#1a1a1a");
        expect(css).toMatch(/body \{[^}]*background-color: var\(--color-page\)/);
    });
});
