import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import postcss from "postcss";
import * as sass from "sass";

// The page-entrance rise is shared, so this pins its compiled contract: the
// same rise, timing, stagger, and reduced-motion gate, whatever the keyframes
// are called.

const css = sass.compile(resolve(dirname(new URL(import.meta.url).pathname), "main.scss")).css;
const root = postcss.parse(css);

// Whether the rule sits under the media query for visitors who allow motion.
const allowsMotionOnly = (rule) =>
    rule.parent?.type === "atrule" && rule.parent.params.includes("prefers-reduced-motion: no-preference");

// The declarations of `selector` that only apply when the visitor allows motion.
function motionDeclarations(selector) {
    const found = {};
    root.walkRules((rule) => {
        if (!rule.selectors.includes(selector) || !allowsMotionOnly(rule)) return;
        rule.walkDecls((decl) => {
            found[decl.prop] = decl.value;
        });
    });
    if (!Object.keys(found).length) throw new Error(`no motion rule for ${selector}`);
    return found;
}

// Every selector that animates only when the visitor allows motion.
function animatedSelectors() {
    const found = [];
    root.walkRules((rule) => {
        if (!allowsMotionOnly(rule)) return;
        if (rule.some((node) => node.type === "decl" && node.prop.startsWith("animation"))) found.push(rule.selector);
    });
    return found;
}

// The `from` frame of the named keyframes, as { property: value }.
function fromFrame(name) {
    let frame;
    root.walkAtRules("keyframes", (atRule) => {
        if (atRule.params !== name) return;
        atRule.walkRules("from", (rule) => {
            frame = Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((decl) => [decl.prop, decl.value]));
        });
    });
    if (!frame) throw new Error(`no @keyframes ${name} from frame`);
    return frame;
}

function toFrame(name) {
    let frame;
    root.walkAtRules("keyframes", (atRule) => {
        if (atRule.params !== name) return;
        atRule.walkRules((rule) => {
            if (rule.selector !== "to" && rule.selector !== "100%") return;
            frame = Object.fromEntries(rule.nodes.filter((node) => node.type === "decl").map((decl) => [decl.prop, decl.value]));
        });
    });
    if (!frame) throw new Error(`no @keyframes ${name} to frame`);
    return frame;
}

describe("Home hero entrance", () => {
    it("plays the rise only when the visitor allows motion", () => {
        const hero = motionDeclarations(".homeHeroPhotos li");
        const name = hero.animation.split(" ")[0];

        expect(hero.animation).toBe(`${name} 640ms cubic-bezier(0.23, 1, 0.32, 1) both`);
        expect(motionDeclarations(".homeHeroPhotos li:nth-child(1)")["--rise"]).toBe("20px");
        expect(motionDeclarations(".homeHeroPhotos li:nth-child(2)")).toMatchObject({ "--rise": "14px", "animation-delay": "110ms" });
        expect(motionDeclarations(".homeHeroPhotos li:nth-child(3)")).toMatchObject({ "--rise": "10px", "animation-delay": "180ms" });

        expect(hero.opacity).toBe("0");
        expect(hero.transform).toBe("translateY(var(--rise, 14px)) scale(0.98)");
        expect(fromFrame(name)).toMatchObject({ opacity: "0" });
        expect(fromFrame(name).transform).toMatch(/^translateY\(var\(--rise\b.*\)\) scale\(0\.98\)$/);
        expect(toFrame(name)).toMatchObject({ opacity: "1", transform: "translateY(0) scale(1)" });
    });

    it("compiles the hero wave to the same rules as the original literals", () => {
        const media = [];
        root.walkAtRules("media", (atRule) => {
            if (!atRule.params.includes("prefers-reduced-motion: no-preference")) return;
            const text = atRule.toString();
            if (text.includes(".homeHeroPhotos li {")) media.push(text);
        });

        expect(media).toHaveLength(1);
        expect(media[0]).toBe(
            `@media (prefers-reduced-motion: no-preference) {
  .homeHeroPhotos li {
    opacity: 0;
    transform: translateY(var(--rise, 14px)) scale(0.98);
    animation: page-entrance-rise 640ms cubic-bezier(0.23, 1, 0.32, 1) both;
  }
  .homeHeroPhotos li:nth-child(1) {
    --rise: 20px;
  }
  .homeHeroPhotos li:nth-child(2) {
    --rise: 14px;
    animation-delay: 110ms;
  }
  .homeHeroPhotos li:nth-child(3) {
    --rise: 10px;
    animation-delay: 180ms;
  }
}`
        );
    });
});

describe("page entrance rise", () => {
    it("rises 14px for a caller that sets no distance", () => {
        const name = motionDeclarations(".homeHeroPhotos li").animation.split(" ")[0];

        expect(fromFrame(name).transform).toBe("translateY(var(--rise, 14px)) scale(0.98)");
    });
});

describe("Events page entrance", () => {
    const rootSelector = ".eventsCalendar .page--events--enter";
    const rises = { 1: "20px", 2: "14px", 3: "10px" };
    const delays = { 2: "70ms", 3: "120ms" };

    function expectStep(selector, step) {
        const declarations = motionDeclarations(selector);
        const name = declarations.animation.split(" ")[0];

        expect(declarations.animation).toBe(`${name} 520ms cubic-bezier(0.23, 1, 0.32, 1) both`);
        expect(declarations["--rise"]).toBe(rises[step]);
        if (step === 1) {
            expect(declarations).not.toHaveProperty("animation-delay");
        } else {
            expect(declarations["animation-delay"]).toBe(delays[step]);
        }

        return name;
    }

    it("staggers every view with the shared rise on Events' tighter wave, leaving the heading still", () => {
        const yearCard = motionDeclarations(`${rootSelector} .year > *`);
        expect(yearCard.animation).toBe(`page-entrance-rise 520ms cubic-bezier(0.23, 1, 0.32, 1) both`);
        expect(yearCard["--rise"]).toBe("14px");
        expect(yearCard["--entrance-delay"]).toMatch(/min\(var\(--entrance-i/);
        expect(yearCard["animation-delay"]).toBe("var(--entrance-delay)");

        expectStep(`${rootSelector} .events__sidebar .mini`, 1);
        expectStep(`${rootSelector} .events__legend`, 2);
        expect(() => motionDeclarations(`${rootSelector} .events--with-sidebar .events__main`)).toThrow(/no motion rule/);

        expectStep(`${rootSelector} .card--month .card-title`, 1);

        const monthPad = motionDeclarations(`${rootSelector} .card--month .pad`);
        expect(monthPad.animation).toBe("page-entrance-rise 400ms cubic-bezier(0.23, 1, 0.32, 1) both");
        expect(monthPad["--rise"]).toBe("10px");
        expect(monthPad["animation-delay"]).toMatch(/var\(--entrance-row/);
        expect(monthPad["animation-delay"]).toMatch(/80ms/);

        expectStep(`${rootSelector} .grid__head > :nth-child(n+2):nth-child(-n+4)`, 1);
        expectStep(`${rootSelector} .grid__body > :nth-child(n+2):nth-child(-n+4)`, 1);
        expectStep(`${rootSelector} .grid__head > :nth-child(n+5):nth-child(-n+6)`, 2);
        expectStep(`${rootSelector} .grid__body > :nth-child(n+5):nth-child(-n+6)`, 2);
        expectStep(`${rootSelector} .grid__head > :nth-child(n+7)`, 3);
        expectStep(`${rootSelector} .grid__body > :nth-child(n+7)`, 3);

        const name = yearCard.animation.split(" ")[0];
        expect(fromFrame(name)).toMatchObject({ opacity: "0" });
        expect(fromFrame(name).transform).toBe("translateY(var(--rise, 14px)) scale(0.98)");

        expect(() => motionDeclarations(".eventsCalendar .page--events .events")).toThrow(/no motion rule/);

        const stillParts = animatedSelectors().filter((selector) => /page__title|toolbar|view-toggle|controls/i.test(selector));
        expect(stillParts).toEqual([]);
    });

    it("pops event chips and cards in reading order after their parent", () => {
        for (const selector of [
            `${rootSelector} .pad--event`,
            `${rootSelector} .pad__event`,
            `${rootSelector} .pad__more`,
            `${rootSelector} .grid__event`,
            `${rootSelector} .pastEventCard`,
        ]) {
            const declarations = motionDeclarations(selector);
            expect(declarations.animation).toBe("page-entrance-rise 400ms cubic-bezier(0.23, 1, 0.32, 1) both");
            expect(declarations["--rise"]).toBe("10px");
            expect(declarations["animation-delay"]).toMatch(/var\(--entrance-delay/);
            expect(declarations["animation-delay"]).toMatch(/min\(var\(--entrance-i/);
        }
    });

    it("renders the month view a week row at a time, then left to right in the row", () => {
        const chip = motionDeclarations(`${rootSelector} .card--month .pad__event`);
        const more = motionDeclarations(`${rootSelector} .card--month .pad__more`);

        expect(chip.animation).toBe("page-entrance-rise 400ms cubic-bezier(0.23, 1, 0.32, 1) both");
        expect(chip["--rise"]).toBe("10px");
        expect(chip["animation-delay"]).toMatch(/var\(--entrance-row/);
        expect(chip["animation-delay"]).toMatch(/80ms/);
        expect(chip["animation-delay"]).toMatch(/40ms/);
        expect(chip["animation-delay"]).toMatch(/25ms/);
        expect(chip["animation-delay"]).toMatch(/min\(var\(--entrance-i/);
        expect(more.animation).toBe(chip.animation);
        expect(more["animation-delay"]).toBe(chip["animation-delay"]);
    });
});

describe("Events entrance wave", () => {
    it("replays the month view's week-row wave on newly shown pads and chips", () => {
        const pad = motionDeclarations(".eventsCalendar .page--events .card--month .pad--enter");
        const chip = motionDeclarations(".eventsCalendar .page--events .card--month .pad__event--enter");
        const more = motionDeclarations(".eventsCalendar .page--events .card--month .pad__more--enter");

        expect(pad.animation).toBe("page-entrance-rise 400ms cubic-bezier(0.23, 1, 0.32, 1) both");
        expect(pad["--rise"]).toBe("10px");
        expect(pad["animation-delay"]).toMatch(/var\(--entrance-row/);
        expect(pad["animation-delay"]).toMatch(/80ms/);

        expect(chip.animation).toBe(pad.animation);
        expect(chip["--rise"]).toBe("10px");
        expect(chip["animation-delay"]).toMatch(/var\(--entrance-row/);
        expect(chip["animation-delay"]).toMatch(/80ms/);
        expect(chip["animation-delay"]).toMatch(/40ms/);
        expect(chip["animation-delay"]).toMatch(/25ms/);
        expect(chip["animation-delay"]).toMatch(/min\(var\(--entrance-i/);
        expect(more.animation).toBe(chip.animation);
        expect(more["animation-delay"]).toBe(chip["animation-delay"]);
    });

    it("replays the nested item wave on year days and week events", () => {
        const yearCard = motionDeclarations(".eventsCalendar .page--events .year > .card--enter");
        const yearDay = motionDeclarations(".eventsCalendar .page--events .pad--event--enter");
        const gridEvent = motionDeclarations(".eventsCalendar .page--events .grid__event--enter");

        expect(yearCard.animation).toBe("page-entrance-rise 520ms cubic-bezier(0.23, 1, 0.32, 1) both");
        expect(yearCard["--rise"]).toBe("14px");
        expect(yearCard["animation-delay"]).toBe("var(--entrance-delay)");

        expect(yearDay.animation).toBe("page-entrance-rise 400ms cubic-bezier(0.23, 1, 0.32, 1) both");
        expect(yearDay["--rise"]).toBe("10px");
        expect(yearDay["animation-delay"]).toMatch(/min\(var\(--entrance-i/);
        expect(gridEvent.animation).toBe(yearDay.animation);
        expect(gridEvent["animation-delay"]).toBe(yearDay["animation-delay"]);
    });
});

describe("shared page entrance", () => {
    it("staggers vertical list items with the shared item cap", () => {
        const item = motionDeclarations(".pageEntrance--enter .pageEntrance__listItem");
        expect(item.animation).toBe("page-entrance-rise 400ms cubic-bezier(0.23, 1, 0.32, 1) both");
        expect(item["--rise"]).toBe("10px");
        expect(item["animation-delay"]).toBe("var(--entrance-delay)");
        expect(item["--entrance-delay"]).toMatch(/min\(var\(--entrance-i/);
    });

    it("gives card-grid items the same row-then-column delay as the month view", () => {
        const item = motionDeclarations(".pageEntrance--enter .pageEntrance__item");
        const chip = motionDeclarations(".eventsCalendar .page--events--enter .card--month .pad__event");

        expect(item.animation).toBe("page-entrance-rise 400ms cubic-bezier(0.23, 1, 0.32, 1) both");
        expect(item["--rise"]).toBe("10px");
        expect(item["animation-delay"]).toBe(chip["animation-delay"]);
    });

    it("plays the navbar and footer on Home's three beats, only when motion is allowed", () => {
        expect(motionDeclarations(".site-navigation--enter .nav-logo")).toMatchObject({
            animation: "page-entrance-rise 640ms cubic-bezier(0.23, 1, 0.32, 1) both",
            "--rise": "20px",
        });
        expect(motionDeclarations(".site-navigation--enter .nav-primary-links")).toMatchObject({
            "--rise": "14px",
            "animation-delay": "110ms",
        });
        expect(motionDeclarations(".site-navigation--enter .nav-account")).toMatchObject({
            "--rise": "10px",
            "animation-delay": "180ms",
        });
        expect(motionDeclarations(".site-footer--enter .footerBrand")["--rise"]).toBe("20px");
        expect(motionDeclarations(".site-footer--enter .footerSocials")).toMatchObject({
            "--rise": "10px",
            "animation-delay": "180ms",
        });
    });

    it("scales overlays in from their trigger in 180ms, and out faster", () => {
        const enter = motionDeclarations(".overlayEntrance");
        const leave = motionDeclarations(".overlayEntrance--leave");

        expect(enter.animation).toBe("overlay-entrance 180ms cubic-bezier(0.23, 1, 0.32, 1) both");
        expect(enter["transform-origin"]).toBe("var(--overlay-origin, center)");
        expect(enter["--overlay-scale"]).toBe("0.97");
        expect(fromFrame("overlay-entrance")).toMatchObject({
            opacity: "0",
            transform: "scale(var(--overlay-scale, 0.97))",
        });

        expect(leave.animation).toBe("overlay-exit 140ms cubic-bezier(0.23, 1, 0.32, 1) both");
    });
});
