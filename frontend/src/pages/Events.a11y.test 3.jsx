/*
Purpose: WCAG 2.2 AA checks (axe) on the events calendar: every view, an open event popover, the
  year view's day overlay, and the phone date picker.
Authentication/Authorization Requirements: Auth context, runtime mode, gsap, and the API are mocked.
Expected Request Information: The event list request, answered by the test.
Expected Response Information: No axe violations. Colour contrast is left to contrast.test.js, because
  jsdom does not compute styles.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import EventsPage from "./Events";

vi.mock("../runtime", () => ({ isProduction: true, apiBaseUrl: "" }));
vi.mock("../context/AuthContext", () => ({ useAuthContext: () => ({ isAuthenticated: false, can: () => false }) }));

// Tweens finish the moment they start, so an opened overlay is fully open by
// the time axe looks at it.
vi.mock("gsap", () => {
    const run = (vars = {}) => {
        vars.onStart?.();
        vars.onComplete?.();
    };
    return {
        gsap: {
            to: (_target, vars) => run(vars),
            fromTo: (_target, _from, vars) => run(vars),
            set: () => {},
            killTweensOf: () => {},
            utils: { random: () => 0 },
        },
    };
});

const EVENTS = [
    {
        eId: "study-jam",
        eName: "Study Jam",
        eStartDate: "2026-10-20T17:00:00.000Z",
        eEndDate: "2026-10-20T18:30:00.000Z",
        eLocation: "MGH 120",
        eDescription: "Bring your problem sets.",
        eLabels: ["Academic"],
    },
    {
        eId: "resume-clinic",
        eName: "Resume Clinic",
        eStartDate: "2026-10-22T19:00:00.000Z",
        eEndDate: "2026-10-22T20:00:00.000Z",
        eLabels: ["Career"],
    },
];

async function visit(url) {
    const view = render(
        <MemoryRouter initialEntries={[url]}>
            <EventsPage />
        </MemoryRouter>,
    );
    await act(async () => {});
    return view;
}

// The WCAG 2.0-2.2 A and AA rules axe can check.
async function violations(root) {
    const results = await axe.run(root, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        rules: { "color-contrast": { enabled: false } },
    });
    return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const VIEWS = [
    ["month view", "/events?date=2026-10-20"],
    ["week view", "/events?view=week&date=2026-10-20"],
    ["day view", "/events?view=day&date=2026-10-22"],
    ["year view", "/events?view=year&date=2026-10-20"],
];

beforeEach(() => {
    vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: () => Promise.resolve(EVENTS) });
    window.scrollTo = vi.fn();
    // axe probes icon fonts with a canvas, which jsdom lacks; with none it skips the probe.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.matchMedia;
});

describe("Events page: WCAG 2.2 AA (axe)", () => {
    for (const [name, url] of VIEWS) {
        it(`finds nothing in the ${name}`, async () => {
            const { container } = await visit(url);
            expect(await violations(container)).toEqual([]);
        });
    }

    it("finds nothing with a month-view event popover open", async () => {
        const { container } = await visit("/events?date=2026-10-20");

        fireEvent.click(container.querySelector(".pad__event"));

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        // The popover renders into <body>, outside the page's container.
        expect(await violations(document.body)).toEqual([]);
    });

    it("finds nothing with a week-view event popover open", async () => {
        const { container } = await visit("/events?view=week&date=2026-10-20");

        fireEvent.click(container.querySelector(".grid__event--button"));

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(await violations(document.body)).toEqual([]);
    });

    it("finds nothing with a year-view day open in place", async () => {
        const { container } = await visit("/events?view=year&date=2026-10-20");

        fireEvent.click(container.querySelector(".pad--event"));

        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(await violations(container)).toEqual([]);
    });

    describe("on a phone", () => {
        // matchMedia as a phone reports it: the mobile query matches.
        beforeEach(() => {
            window.matchMedia = (query) => ({
                matches: query === "(max-width: 900px)",
                media: query,
                addEventListener() {},
                removeEventListener() {},
            });
        });

        for (const [name, url] of VIEWS.slice(0, 3)) {
            it(`finds nothing in the ${name} with the date picker open`, async () => {
                const { container } = await visit(url);

                fireEvent.click(container.querySelector(".picker__toggle"));

                expect(screen.getByRole("group", { name: "Months" })).toBeInTheDocument();
                expect(await violations(container)).toEqual([]);
            });
        }
    });
});
