import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import * as sass from "sass";
import { MOBILE_QUERY } from "../../utils/calendar/breakpoints";

// jsdom applies no stylesheet, so the accessibility guarantees that live in
// the calendar's styles are checked against the compiled CSS instead: target
// sizes, zoom, focus visibility, and the one breakpoint script and styles share.
// Layout itself is checked in a real browser, not here.

const stylesheet = resolve(
    dirname(new URL(import.meta.url).pathname),
    "../../stylesheets/components/eventsCalendar/_index.scss",
);
const css = sass.compile(stylesheet).css;

// Every style rule as { media, selector, declarations }, one level of @media
// or @container deep, which is all the calendar's stylesheet uses.
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

// The declarations for `selector` (written without the .eventsCalendar scope),
// merged across every rule for it under `media`.
function style(selector, media = null) {
    const scoped = selector
        .split(",")
        .map((part) => `.eventsCalendar ${part.trim()}`)
        .join(", ");
    const found = rules.filter((rule) => rule.selector === scoped && rule.media === media);
    if (found.length === 0) throw new Error(`no rule for ${scoped}${media ? ` in ${media}` : ""}`);
    return Object.assign({}, ...found.map((rule) => rule.declarations));
}

const PHONE = `@media ${MOBILE_QUERY}`;
const px = (value) => Number.parseFloat(value);

describe("calendar styles", () => {
    it("switch to the phone layout at the same width the script does", () => {
        // The date picker shows from script and the sidebar hides from the
        // stylesheet; a mismatch would leave a width with neither or both.
        expect(style(".events__sidebar", PHONE).display).toBe("none");
    });

    it("keep every control past the 24px minimum target (2.5.8)", () => {
        expect(px(style(".pad__event, .pad__more")["min-height"])).toBeGreaterThanOrEqual(24);
        expect(px(style(".toolbar__today").height)).toBeGreaterThanOrEqual(24);
        expect(px(style(".picker__toggle")["min-height"])).toBeGreaterThanOrEqual(24);
        expect(px(style(".strip__month")["min-height"])).toBeGreaterThanOrEqual(24);
        expect(px(style(".strip__month")["min-width"])).toBeGreaterThanOrEqual(24);
    });

    it("pass a phone's tap through the chips too small to aim at, to their day (2.5.8)", () => {
        expect(style(".pad__event, .pad__more", PHONE)["pointer-events"]).toBe("none");
        expect(style(".grid--tap-days .grid__event--button")["pointer-events"]).toBe("none");
    });

    it("set the phone's view dropdown at 16px, so iOS does not zoom in on it", () => {
        expect(px(style(".view-select__input")["font-size"])).toBeGreaterThanOrEqual(16);
    });

    it("hand only the sideways pan to the swipe, keeping pinch zoom (1.4.4)", () => {
        for (const selector of [".events__main--swipe", ".grid__scroll", ".picker__month .mini__body"]) {
            expect(style(selector)["touch-action"]).toBe("pan-y pinch-zoom");
        }
    });

    it("keep a focused event clear of the sticky day header (2.4.11)", () => {
        expect(style(".grid__scroll")["scroll-padding-top"]).toBe(style(".grid__head")["min-height"]);
        // The grid's layers stay inside it, under the popover.
        expect(style(".grid").isolation).toBe("isolate");
    });

    it("keep a week event's start time in its name while hiding it on a phone", () => {
        const time = style(".grid__event--button .grid__event-time", PHONE);

        // Clipped, not display: none, which would take it out of the name too.
        expect(time.display).toBeUndefined();
        expect(time.clip).toBe("rect(0, 0, 0, 0)");
    });

    it("give the picked mini-month day dark text on its white fill, and mute only the weekday initials", () => {
        expect(style(".mini__day--anchor")).toMatchObject({ "background-color": "#fff", color: "#000" });
        expect(style(".mini__weekdays span").color).toBe("#b0b0b0");
        expect(rules.some((rule) => rule.selector.includes(".mini__week span"))).toBe(false);
    });

    // Under the .eventsCalendar scope, a Sass "X &" selector would put X outside the
    // calendar, where it never matches. These two carry contrast, so they are pinned.
    it("give a year-view event day dark text, readable on any label colour (1.4.3)", () => {
        expect(style(".card--compact .pad--event .pad__day").color).toBe("#1a1a1a");
    });

    it("give the phone picker's year dark text on the picked month's white fill (1.4.3)", () => {
        expect(style(".strip__month--selected .strip__year").color).toBe("#000");
    });

    it("keep every selector inside the calendar", () => {
        const outside = rules.filter(
            (rule) =>
                // Split on the list's own commas, not those inside :where(...).
                !rule.selector.split(/,(?![^(]*\))/).every((part) => part.trim().startsWith(".eventsCalendar")) &&
                !rule.selector.startsWith("@") &&
                !/^(from|to|\d+%)$/.test(rule.selector),
        );
        expect(outside.map((rule) => rule.selector)).toEqual([]);
    });
});
