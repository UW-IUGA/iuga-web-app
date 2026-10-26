import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import postcss from "postcss";
import * as sass from "sass";

// The site's frame: the navbar, every page and the footer share the events
// page's width and side gutter, so their edges line up at every screen width.
// This reads the compiled stylesheet, so a page that sets its own outer width
// or gutter again, at any breakpoint, fails here.

const css = sass.compile(resolve(dirname(new URL(import.meta.url).pathname), "../main.scss")).css;
const root = postcss.parse(css);

// Every declaration in a rule whose selector list names `selector`, with the
// media query it sits under ("" when none).
function declarations(selector) {
    const found = [];
    root.walkRules((rule) => {
        if (!rule.selectors.includes(selector)) return;
        const media = rule.parent?.type === "atrule" && rule.parent.name === "media" ? rule.parent.params : "";
        rule.walkDecls((decl) => found.push({ prop: decl.prop, value: decl.value, media }));
    });
    if (!found.length) throw new Error(`no rule for ${selector}`);
    return found;
}

const FRAME_PROPS = ["width", "max-width", "min-width", "padding", "padding-inline", "padding-left", "padding-right", "margin", "margin-inline", "margin-left", "margin-right"];
const frameOf = (selector) => declarations(selector).filter(({ prop }) => FRAME_PROPS.includes(prop));

describe("the site frame", () => {
    it("sets one side gutter: the events page's 16px on a phone and 32px from a tablet up", () => {
        const gutter = declarations(":root").filter(({ prop }) => prop === "--site-gutter");
        expect(gutter).toEqual([
            { prop: "--site-gutter", value: "16px", media: "" },
            { prop: "--site-gutter", value: "32px", media: "(min-width: 768px)" },
        ]);
    });

    it.each([".baseContainer", ".nav-container", ".footerContainer"])(
        "gives %s the events page's width and gutter, at every breakpoint",
        (selector) => {
            expect(frameOf(selector)).toEqual([
                { prop: "width", value: "100%", media: "" },
                { prop: "max-width", value: "1400px", media: "" },
                { prop: "margin-inline", value: "auto", media: "" },
                { prop: "padding-inline", value: "var(--site-gutter)", media: "" },
            ]);
        },
    );

    it("keeps the events page on the same width and gutter", () => {
        expect(declarations(".eventsCalendar .page")).toEqual(
            expect.arrayContaining([{ prop: "max-width", value: "1400px", media: "" }]),
        );
        const events = declarations(".eventsCalendar .page--events");
        expect(events.filter(({ prop }) => prop === "--page-gutter")).toEqual([
            { prop: "--page-gutter", value: "var(--site-gutter)", media: "" },
        ]);
        expect(events.filter(({ prop }) => prop === "padding-inline")).toEqual([
            { prop: "padding-inline", value: "var(--page-gutter)", media: "" },
        ]);
    });

    it("lets no page widen or narrow the base container itself", () => {
        const overrides = [];
        root.walkRules((rule) => {
            if (!rule.selectors.some((s) => s.includes(".baseContainer") && s !== ".baseContainer")) return;
            rule.walkDecls((decl) => FRAME_PROPS.includes(decl.prop) && overrides.push(`${rule.selector} { ${decl.prop}: ${decl.value} }`));
        });
        expect(overrides).toEqual([]);
    });

    it("lines the shop's cart panel up with the frame's right edge", () => {
        expect(declarations(".shopCartDropdown__panel").filter(({ prop }) => prop === "right")).toEqual([
            { prop: "right", value: "calc((100% - min(100%, 1400px)) / 2 + var(--site-gutter))", media: "" },
        ]);
    });
});
