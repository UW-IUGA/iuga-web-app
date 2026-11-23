import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import * as sass from "sass";

const css = sass.compile(resolve(dirname(new URL(import.meta.url).pathname), "main.scss")).css;

// Every rule body whose selector list names the selector.
const rulesFor = (selector) => [...css.matchAll(/(^|\n)([^{}@]+)\{([^}]*)\}/g)]
    .filter(([, , selectors]) => selectors.split(",").map((part) => part.trim()).includes(selector))
    .map(([, , , body]) => body);

describe("pill buttons", () => {
    // Browsers give <button> their own system font, so a button pill would not match a link pill (#428).
    it("use the page's font, even on a <button>", () => {
        expect(rulesFor(".pill-button").some((body) => /font-family:\s*inherit/.test(body))).toBe(true);
    });
});
