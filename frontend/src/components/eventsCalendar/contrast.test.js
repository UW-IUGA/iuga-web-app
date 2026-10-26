import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { colorForLabels, EVENT_LABELS } from "../../utils/calendar/calendar";

// jsdom does not compute styles, so axe cannot check contrast. This checks the
// pairs the stylesheets actually put together instead, from the Sass tokens,
// so a palette change that breaks WCAG 1.4.3 / 1.4.11 fails here.

const variables = readFileSync(
    resolve(dirname(new URL(import.meta.url).pathname), "../../stylesheets/abstracts/_eventsCalendar.scss"),
    "utf8",
);

// Six-digit hex, whichever way the token is written: stylelint asks for the short
// form (#fff) wherever one exists.
function token(name) {
    const match = variables.match(new RegExp(`\\$${name}:\\s*#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b`));
    if (!match) throw new Error(`no hex value for $${name}`);
    const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
    return `#${digits}`;
}

const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance(hex) {
    const [r, g, b] = channels(hex).map((value) => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
}

// Sass's color.adjust($c, $lightness: n%): raise HSL lightness by `amount`.
function lighten(hex, amount) {
    const [r, g, b] = channels(hex).map((c) => c / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = Math.min((max + min) / 2 + amount, 1);
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * ((max + min) / 2) - 1));
    let h = 0;
    if (d !== 0) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
    }
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h % 2) - 1));
    const m = l - c / 2;
    const [r1, g1, b1] =
        h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
    return `#${[r1, g1, b1]
        .map((v) =>
            Math.round((v + m) * 255)
                .toString(16)
                .padStart(2, "0"),
        )
        .join("")}`;
}

const BG = token("calendar-bg");
const CARD = token("calendar-card-bg");
const PAD = token("calendar-pad");
const TEXT = token("calendar-text");
const MUTED = token("calendar-copy-muted");
const LIGHT = token("calendar-copy-bg");
const DARK_TEXT = token("calendar-copy-text");
const NOW = token("calendar-now-line");

// A month pad on hover, as _card.scss computes it.
const PAD_HOVER = lighten(PAD, 0.06);

const LABEL_COLORS = EVENT_LABELS.map((label) => colorForLabels([label]));

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
        for (const surface of [BG, CARD, PAD]) expect(ratio(TEXT, surface)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps dark text readable on every label colour (chips, events, painted days)", () => {
        for (const color of LABEL_COLORS) expect(ratio(BG, color)).toBeGreaterThanOrEqual(4.5);
    });

    it("keeps the light pills readable (active view, today, picked day)", () => {
        expect(ratio(DARK_TEXT, LIGHT)).toBeGreaterThanOrEqual(4.5);
    });
});

describe("non-text contrast (1.4.11, 3:1)", () => {
    it("shows the white focus ring against the dark surfaces", () => {
        for (const surface of [BG, CARD, PAD]) expect(ratio(TEXT, surface)).toBeGreaterThanOrEqual(3);
    });

    it("shows the dark focus ring used on label colours against them", () => {
        for (const color of LABEL_COLORS) expect(ratio(BG, color)).toBeGreaterThanOrEqual(3);
    });

    it("shows the today and picked-day fills against the card", () => {
        expect(ratio(LIGHT, CARD)).toBeGreaterThanOrEqual(3);
    });

    it("shows the month view's today circle against its day cell", () => {
        expect(ratio(LIGHT, PAD)).toBeGreaterThanOrEqual(3);
        expect(ratio(LIGHT, PAD_HOVER)).toBeGreaterThanOrEqual(3);
    });

    it("shows the legend swatches against the page", () => {
        for (const color of LABEL_COLORS) expect(ratio(color, BG)).toBeGreaterThanOrEqual(3);
    });

    it("shows a painted year-view day against its card", () => {
        for (const color of LABEL_COLORS) expect(ratio(color, CARD)).toBeGreaterThanOrEqual(3);
    });

    it("shows the year view's current-month outline against the page", () => {
        expect(ratio(TEXT, BG)).toBeGreaterThanOrEqual(3);
    });

    it("shows the date picker's divider against its panel", () => {
        expect(ratio(token("calendar-divider"), CARD)).toBeGreaterThanOrEqual(3);
    });

    it("shows the now-line against the grid", () => {
        expect(ratio(NOW, CARD)).toBeGreaterThanOrEqual(3);
    });
});

describe("legend", () => {
    it("reads at 4.5:1 or better against the page (1.4.3)", () => {
        expect(ratio(TEXT, BG)).toBeGreaterThanOrEqual(4.5);
    });
});
