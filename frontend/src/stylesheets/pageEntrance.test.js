import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import * as sass from "sass";

// Home's hero photos enter once per visit. The motion is shared, so this pins
// the compiled contract: the same rise, timing, stagger, and reduced-motion
// gate, regardless of the keyframe name.

const css = sass.compile(resolve(dirname(new URL(import.meta.url).pathname), "main.scss")).css;

function parseRules(source) {
    const rules = [];
    const walk = (text, media) => {
        let depth = 0;
        let start = 0;
        let head = "";
        for (let i = 0; i < text.length; i += 1) {
            if (text[i] === "{") {
                if (depth === 0) {
                    head = text
                        .slice(start, i)
                        .replace(/\/\*[\s\S]*?\*\//g, "")
                        .trim();
                    start = i + 1;
                }
                depth += 1;
            } else if (text[i] === "}") {
                depth -= 1;
                if (depth === 0) {
                    const body = text.slice(start, i);
                    if (head.startsWith("@")) walk(body, head);
                    else {
                        const declarations = Object.fromEntries(
                            body
                                .split(";")
                                .map((line) => line.split(/:(.*)/s).map((part) => part.trim()))
                                .filter(([name, value]) => name && value),
                        );
                        rules.push({ media, selector: head.replace(/\s+/g, " "), declarations });
                    }
                    start = i + 1;
                }
            }
        }
    };
    walk(source, null);
    return rules;
}

const rules = parseRules(css);
const motionRules = rules.filter((rule) =>
    (rule.media || "").includes("prefers-reduced-motion: no-preference"),
);

function declarations(selector) {
    const matches = motionRules.filter((rule) => rule.selector === selector);
    if (!matches.length) throw new Error(`no motion rule for ${selector}`);
    return Object.assign({}, ...matches.map((rule) => rule.declarations));
}

function keyframes(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`@keyframes ${escaped} \\{([\\s\\S]*?)\\n\\}`));
    if (!match) throw new Error(`no @keyframes ${name}`);
    return match[1];
}

describe("Home hero entrance", () => {
    it("plays the rise only when the visitor allows motion", () => {
        const hero = declarations(".homeHeroPhotos li");
        const name = hero.animation.split(" ")[0];

        expect(hero.animation).toBe(`${name} 640ms cubic-bezier(0.23, 1, 0.32, 1) both`);
        expect(declarations(".homeHeroPhotos li:nth-child(1)")["--rise"]).toBe("20px");
        expect(declarations(".homeHeroPhotos li:nth-child(2)")["--rise"]).toBe("14px");
        expect(declarations(".homeHeroPhotos li:nth-child(2)")["animation-delay"]).toBe("110ms");
        expect(declarations(".homeHeroPhotos li:nth-child(3)")["--rise"]).toBe("10px");
        expect(declarations(".homeHeroPhotos li:nth-child(3)")["animation-delay"]).toBe("180ms");

        expect(keyframes(name)).toMatch(/from\s*\{[^}]*opacity:\s*0;/);
        expect(keyframes(name)).toMatch(/transform:\s*translateY\(var\(--rise\)\) scale\(0\.98\)/);
    });
});
