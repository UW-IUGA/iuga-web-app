import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import * as sass from "sass";
import { colorForLabels, EVENT_LABELS } from "../../utils/calendar/calendar";

// jsdom does not compute styles, so axe cannot check contrast. This checks the
// pairs the stylesheets actually put together instead, in both palettes, from
// the custom properties the compiled stylesheet sets on the calendar's root
// (abstracts/eventsCalendar), so a palette change that breaks WCAG 1.4.3 or
// 1.4.11 in either theme fails here.

const css = sass.compile(
    resolve(dirname(new URL(import.meta.url).pathname), "../../stylesheets/components/eventsCalendar/_index.scss"),
).css;

// The --calendar-* properties declared directly in the rule for `selector`.
function palette(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const body = css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`))?.[1];
    if (!body) throw new Error(`no rule for ${selector}`);
    return Object.fromEntries([...body.matchAll(/--calendar-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));
}

const PALETTES = {
    light: palette(".eventsCalendar"),
    dark: palette(".eventsCalendar:where([data-theme=dark] *)"),
};

// Six-digit hex, whichever way the value is written: stylelint asks for the
// short form (#fff) wherever one exists.
function hex(value) {
    const match = value.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
    if (!match) throw new Error(`not a solid hex colour: ${value}`);
    const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
    return `#${digits.toLowerCase()}`;
}

const channels = (color) => [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

function luminance(color) {
    const [r, g, b] = channels(color).map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
}

it("gives both palettes the same colours", () => {
    expect(Object.keys(PALETTES.light)).toEqual(Object.keys(PALETTES.dark));
});

it("keeps the dark palette the prototype's", () => {
    expect(PALETTES.dark).toMatchObject({
        bg: "#1a1a1a",
        "card-bg": "#272727",
        pad: "#333",
        text: "#fff",
        "copy-bg": "#fff",
        "copy-text": "#000",
        "copy-muted": "#b0b0b0",
        "now-line": "#f97362",
        "label-academic": "#5fa5f9",
        "label-social": "#e879f9",
        "label-career": "#2cd4bf",
    });
});

// Hue in degrees, from 0 to 360.
function hue(color) {
    const [r, g, b] = channels(color).map((value) => value / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    if (delta === 0) return 0;
    const sector = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    return (sector * 60 + 360) % 360;
}

it("keeps Career the prototype's teal in light, deepened so white text reads on it", () => {
    expect(Math.abs(hue(hex(PALETTES.light["label-career"])) - hue(hex(PALETTES.dark["label-career"])))).toBeLessThan(2);
});

describe.each(Object.entries(PALETTES))("the %s palette", (_theme, values) => {
    const color = (name) => {
        if (!(name in values)) throw new Error(`no --calendar-${name}`);
        return hex(values[name]);
    };
    const BG = color("bg");
    const CARD = color("card-bg");
    const PAD = color("pad");
    const PAD_HOVER = color("pad-hover");
    const TEXT = color("text");
    const HEADING = color("heading");
    const MUTED = color("copy-muted");
    const LIGHT = color("copy-bg");
    const LIGHT_TEXT = color("copy-text");
    const ON_LABEL = color("on-label");
    const NOW = color("now-line");
    // colorForLabels names a custom property; read it from this palette.
    const LABELS = EVENT_LABELS.map((label) => color(colorForLabels([label]).match(/^var\(--calendar-([\w-]+)\)$/)[1]));

    describe("text contrast (1.4.3, 4.5:1)", () => {
        it.each([
            ["the page", BG],
            ["a card", CARD],
            ["a day cell", PAD],
            ["a day cell on hover", PAD_HOVER],
        ])("keeps muted text readable on %s", (_name, surface) => {
            expect(ratio(MUTED, surface)).toBeGreaterThanOrEqual(4.5);
        });

        it("keeps body text readable on every surface", () => {
            for (const surface of [BG, CARD, PAD, PAD_HOVER]) expect(ratio(TEXT, surface)).toBeGreaterThanOrEqual(4.5);
        });

        it("keeps the page title readable on the page", () => {
            expect(ratio(HEADING, BG)).toBeGreaterThanOrEqual(4.5);
        });

        it("keeps text on every label colour readable (chips, events, painted days)", () => {
            for (const label of LABELS) expect(ratio(ON_LABEL, label)).toBeGreaterThanOrEqual(4.5);
        });

        it("keeps the strong pills readable (active view, today, picked day)", () => {
            expect(ratio(LIGHT_TEXT, LIGHT)).toBeGreaterThanOrEqual(4.5);
        });

        it("keeps a label-coloured event's button readable", () => {
            // .card-content__button: body text on an on-label pill.
            expect(ratio(TEXT, ON_LABEL)).toBeGreaterThanOrEqual(4.5);
        });
    });

    describe("non-text contrast (1.4.11, 3:1)", () => {
        it("shows the focus ring against every surface", () => {
            for (const surface of [BG, CARD, PAD]) expect(ratio(TEXT, surface)).toBeGreaterThanOrEqual(3);
        });

        it("shows the focus ring used on label colours against them", () => {
            for (const label of LABELS) expect(ratio(ON_LABEL, label)).toBeGreaterThanOrEqual(3);
        });

        it("shows the today and picked-day fills against the card", () => {
            expect(ratio(LIGHT, CARD)).toBeGreaterThanOrEqual(3);
        });

        it("shows the month view's today circle against its day cell", () => {
            expect(ratio(LIGHT, PAD)).toBeGreaterThanOrEqual(3);
            expect(ratio(LIGHT, PAD_HOVER)).toBeGreaterThanOrEqual(3);
        });

        it("shows the legend swatches against the page", () => {
            for (const label of LABELS) expect(ratio(label, BG)).toBeGreaterThanOrEqual(3);
        });

        it("shows a painted year-view day against its card", () => {
            for (const label of LABELS) expect(ratio(label, CARD)).toBeGreaterThanOrEqual(3);
        });

        it("shows the year view's current-month outline against the page", () => {
            expect(ratio(TEXT, BG)).toBeGreaterThanOrEqual(3);
        });

        it("shows the date picker's divider against its panel", () => {
            expect(ratio(color("divider"), CARD)).toBeGreaterThanOrEqual(3);
        });

        it("shows the now-line against the grid", () => {
            expect(ratio(NOW, CARD)).toBeGreaterThanOrEqual(3);
        });
    });
});
