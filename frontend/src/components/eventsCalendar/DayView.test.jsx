import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MOBILE_QUERY } from "../../utils/calendar/breakpoints";
import { normalizeEvent } from "../../utils/calendar/calendar";
import DayView from "./DayView";

// Tweens finish the moment they start, so the popover's open and close run to
// completion synchronously. A test can hold them back with `tweens.defer`, then
// let the held ones finish with finishTweens().
const tweens = vi.hoisted(() => ({ defer: false, pending: [] }));

vi.mock("gsap", () => {
    const run = (vars = {}) => {
        vars.onStart?.();
        vars.onComplete?.();
    };
    const start = (target, vars = {}) => {
        if (tweens.defer) tweens.pending.push({ target, vars });
        else run(vars);
    };
    return {
        gsap: {
            to: (target, vars) => start(target, vars),
            fromTo: (target, _from, vars) => start(target, vars),
            set: () => {},
            // A killed tween never completes, as in gsap, so its onComplete is dropped.
            killTweensOf: (targets) => {
                const killed = [].concat(targets);
                tweens.pending = tweens.pending.filter(({ target }) => !killed.includes(target));
            },
            utils: { random: () => 0 },
        },
    };
});

// Thu Oct 22 2026, 1pm Pacific.
const anchor = () => new Date("2026-10-22T20:00:00.000Z");

const rich = () =>
    normalizeEvent({
        eId: "panel",
        eName: "Industry Panel",
        eStartDate: "2026-10-22T17:00:00Z",
        eEndDate: "2026-10-22T19:00:00Z",
        eDescription: "Designers from TikTok and Expedia share their journeys.",
        eLocation: "HUB332",
        eOrganizers: "IUGA x HCDEsa",
        eLabels: ["Career"],
        eAltLink: { title: "Event page", url: "https://example.com/panel" },
        participants: 42,
        showParticipants: true,
        rsvpEnabled: true,
        rsvpQuestions: [{ qId: "q1", qString: "Any dietary restrictions?" }],
    });

function renderDay({ events = [], onSelectDay = vi.fn() } = {}) {
    return {
        onSelectDay,
        ...render(<DayView anchor={anchor()} events={events} onSelectDay={onSelectDay} />),
    };
}

const eventButton = (name) => screen.getByRole("button", { name: new RegExp(name) });

// Lets every held tween finish, as gsap would once its time is up.
function finishTweens() {
    const held = tweens.pending;
    tweens.pending = [];
    for (const { vars } of held) vars.onComplete?.();
}

// jsdom lays nothing out, so a test gives the popover its size and the event its place.
const popoverSize = { width: 343, height: 0 };
const sizePopover = (height, width = 343) => {
    popoverSize.height = height;
    popoverSize.width = width;
};
const LAYOUT_READS = {
    offsetWidth: () => popoverSize.width,
    offsetHeight: () => popoverSize.height,
    clientHeight: () => popoverSize.height,
    scrollHeight: () => popoverSize.height,
};
let savedLayout = [];

// Only .popover elements answer with the size above; everything else stays as jsdom has it.
function stubPopoverLayout() {
    savedLayout = Object.keys(LAYOUT_READS).map((name) => [
        name,
        Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
    ]);
    for (const [name, read] of Object.entries(LAYOUT_READS)) {
        Object.defineProperty(HTMLElement.prototype, name, {
            configurable: true,
            get() {
                return this.classList.contains("popover") ? read() : 0;
            },
        });
    }
}

function restorePopoverLayout() {
    for (const [name, descriptor] of savedLayout) {
        if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor);
        else delete HTMLElement.prototype[name];
    }
}

// Where an event's block sits on screen. Its bottom follows from its height.
function placeBlock(block, { top, height = 48, left, right }) {
    block.getBoundingClientRect = () => ({
        top,
        bottom: top + height,
        left,
        right,
        width: right - left,
        height,
        x: left,
        y: top,
        toJSON() {},
    });
}

const setViewport = (width, height) => {
    window.innerWidth = width;
    window.innerHeight = height;
};

afterEach(() => {
    cleanup();
    tweens.defer = false;
    tweens.pending = [];
});

describe("DayView", () => {
    it("renders the grid as a single column", () => {
        const { container } = renderDay();

        expect(container.querySelectorAll(".grid__col")).toHaveLength(1);
        expect(container.querySelectorAll(".grid__dayhead")).toHaveLength(1);
    });

    it("draws each event of the day as a button in its block", () => {
        renderDay({
            events: [
                rich(),
                normalizeEvent({
                    eId: "jam",
                    eName: "Study Jam",
                    eStartDate: "2026-10-22T21:00:00Z",
                    eEndDate: "2026-10-22T22:30:00Z",
                }),
            ],
        });

        expect(eventButton("Industry Panel")).toBeTruthy();
        expect(eventButton("Study Jam")).toBeTruthy();
    });

    it("prints nothing under the grid until one of its events is clicked", () => {
        renderDay({ events: [rich()] });

        expect(screen.queryByRole("heading")).toBeNull();
        expect(screen.queryByText("Thursday, October 22, 2026")).toBeNull();
        expect(screen.queryByText(/TikTok and Expedia/)).toBeNull();
    });

    it("prints no message when the day is empty", () => {
        renderDay();

        expect(screen.queryByText("Nothing scheduled.")).toBeNull();
        expect(screen.queryByRole("heading")).toBeNull();
    });

    it("ignores an event from another day", () => {
        renderDay({
            events: [
                normalizeEvent({
                    eId: "other",
                    eName: "Some other day",
                    eStartDate: "2026-10-25T17:00:00Z",
                    eEndDate: "2026-10-25T18:00:00Z",
                }),
            ],
        });

        expect(screen.queryByRole("button", { name: /Some other day/ })).toBeNull();
    });

    describe("event popover", () => {
        it("opens the clicked event in a popover with its details", () => {
            renderDay({ events: [rich()] });

            fireEvent.click(eventButton("Industry Panel"));

            const dialog = screen.getByRole("dialog", { name: "Industry Panel" });
            expect(within(dialog).getByRole("heading", { name: "Industry Panel" })).toBeTruthy();
            expect(within(dialog).getByText("Thursday, October 22, 2026")).toBeTruthy();
            expect(within(dialog).getByText(/TikTok and Expedia/)).toBeTruthy();
            expect(within(dialog).getByText("HUB332")).toBeTruthy();
            expect(within(dialog).getByText("IUGA x HCDEsa")).toBeTruthy();
            expect(within(dialog).getByText("42")).toBeTruthy();
        });

        it("leaves out the meta rows the source did not fill in", () => {
            renderDay({
                events: [
                    normalizeEvent({
                        eId: "plain",
                        eName: "Bare event",
                        eStartDate: "2026-10-22T17:00:00Z",
                        eEndDate: "2026-10-22T18:00:00Z",
                    }),
                ],
            });

            fireEvent.click(eventButton("Bare event"));

            const dialog = screen.getByRole("dialog", { name: "Bare event" });
            expect(within(dialog).queryByText("Location")).toBeNull();
            expect(within(dialog).queryByText("Organizers")).toBeNull();
            expect(within(dialog).queryByText("RSVP")).toBeNull();
        });

        it("shows the label chips, with Career as Career", () => {
            renderDay({ events: [rich()] });

            fireEvent.click(eventButton("Industry Panel"));

            const dialog = screen.getByRole("dialog", { name: "Industry Panel" });
            expect(within(dialog).getByText("Career")).toBeTruthy();
        });

        it("opens to the right of the grid", () => {
            renderDay({ events: [rich()] });

            fireEvent.click(eventButton("Industry Panel"));

            expect(screen.getByRole("dialog").classList).toContain("popover--right");
        });

        it("leaves out View day, since the day is already on screen", () => {
            renderDay({ events: [rich()] });

            fireEvent.click(eventButton("Industry Panel"));

            expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
            expect(screen.queryByRole("button", { name: "View day" })).toBeNull();
        });

        it("closes from its close button, and hands focus back to the event", () => {
            renderDay({ events: [rich()] });
            const event = eventButton("Industry Panel");

            fireEvent.click(event);
            fireEvent.click(screen.getByRole("button", { name: "Close" }));

            expect(screen.queryByRole("dialog")).toBeNull();
            expect(document.activeElement).toBe(event);
        });

        it("opens from the keyboard, as it does in week view", () => {
            renderDay({ events: [rich()] });
            eventButton("Industry Panel").focus();

            act(() => userEvent.keyboard("{Enter}"));

            expect(screen.getByRole("dialog", { name: "Industry Panel" })).toBeTruthy();
            expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
        });

        it("closes when the day changes under it", () => {
            const { rerender } = renderDay({ events: [rich()] });

            fireEvent.click(eventButton("Industry Panel"));
            rerender(<DayView anchor={new Date("2026-10-23T20:00:00.000Z")} events={[rich()]} onSelectDay={vi.fn()} />);

            expect(screen.queryByRole("dialog")).toBeNull();

            // And it does not come back on stepping back to the day it opened on.
            rerender(<DayView anchor={anchor()} events={[rich()]} onSelectDay={vi.fn()} />);

            expect(screen.queryByRole("dialog")).toBeNull();
        });

        it("opens again on a tap once it has closed", () => {
            renderDay({ events: [rich()] });

            fireEvent.click(eventButton("Industry Panel"));
            fireEvent.pointerDown(document.body);
            fireEvent.click(eventButton("Industry Panel"));

            expect(screen.getByRole("dialog", { name: "Industry Panel" })).toBeTruthy();
        });

        it("opens again when its block is tapped while the popover is still fading out", () => {
            tweens.defer = true;
            renderDay({ events: [rich()] });

            fireEvent.click(eventButton("Industry Panel"));
            fireEvent.pointerDown(document.body);
            // The fade-out has not finished, and the block is still under it. This tap should reopen the popover.
            fireEvent.click(eventButton("Industry Panel"));
            act(() => finishTweens());

            expect(screen.getByRole("dialog", { name: "Industry Panel" })).toBeTruthy();
        });
    });
});

const usePhone = () => {
    window.matchMedia = (query) => ({
        matches: query === MOBILE_QUERY,
        media: query,
        addEventListener() {},
        removeEventListener() {},
    });
};

describe("DayView on a phone", () => {
    // Week view sends a tap on a phone's column to the day. The day view has no
    // such column, so a tap on an event opens its popover instead.
    beforeEach(usePhone);
    afterEach(() => {
        delete window.matchMedia;
    });

    it("opens the popover for a tap on an event, without going to the day", () => {
        const { onSelectDay } = renderDay({ events: [rich()] });

        fireEvent.click(eventButton("Industry Panel"));

        expect(screen.getByRole("dialog", { name: "Industry Panel" })).toBeTruthy();
        expect(onSelectDay).not.toHaveBeenCalled();
    });
});

describe("event popover placement", () => {
    beforeEach(() => stubPopoverLayout());
    afterEach(() => {
        restorePopoverLayout();
        setViewport(1024, 768);
        delete window.matchMedia;
        delete window.ResizeObserver;
    });

    it("opens beside the event on a wide screen, where it has room", () => {
        setViewport(1280, 800);
        sizePopover(400, 420);
        renderDay({ events: [rich()] });
        const block = eventButton("Industry Panel");
        placeBlock(block, { top: 300, left: 200, right: 900 });

        fireEvent.click(block);

        const dialog = screen.getByRole("dialog", { name: "Industry Panel" });
        // Right of the event, held to the window's edge: 1280 - 16 - 420.
        expect(parseFloat(dialog.style.left)).toBe(844);
        expect(parseFloat(dialog.style.top)).toBe(300);
    });

    it("places the popover above or below its event on a phone, so the event is never covered", () => {
        usePhone();
        setViewport(375, 667);
        sizePopover(563);
        renderDay({ events: [rich()] });
        const block = eventButton("Industry Panel");
        placeBlock(block, { top: 612, left: 42, right: 374 });

        fireEvent.click(block);

        const dialog = screen.getByRole("dialog", { name: "Industry Panel" });
        const top = parseFloat(dialog.style.top);
        // The event runs from 612 to 660, so the popover has to end above it.
        expect(top + 563).toBeLessThanOrEqual(612);
        expect(top).toBeGreaterThanOrEqual(16);
    });

    it("scrolls inside the room below an event that is high on a phone's screen", () => {
        usePhone();
        setViewport(375, 667);
        sizePopover(563);
        renderDay({ events: [rich()] });
        const block = eventButton("Industry Panel");
        placeBlock(block, { top: 150, left: 42, right: 374 });

        fireEvent.click(block);

        const dialog = screen.getByRole("dialog", { name: "Industry Panel" });
        // Just below the event, and as tall as the room below it: 667 - 198 - 8 - 16.
        expect(parseFloat(dialog.style.top)).toBe(206);
        expect(parseFloat(dialog.style.maxHeight)).toBe(445);
    });

    it("moves with its content when the content fills in after it opens", () => {
        usePhone();
        setViewport(375, 667);
        sizePopover(515);
        const resizeCallbacks = [];
        window.ResizeObserver = class {
            constructor(callback) {
                resizeCallbacks.push(callback);
            }
            observe() {}
            disconnect() {}
        };
        renderDay({ events: [rich()] });
        const block = eventButton("Industry Panel");
        placeBlock(block, { top: 612, left: 42, right: 374 });

        fireEvent.click(block);
        // The RSVP block fills in after the popover is placed, making it taller.
        sizePopover(563);
        act(() => resizeCallbacks.forEach((callback) => callback([])));

        const dialog = screen.getByRole("dialog", { name: "Industry Panel" });
        expect(parseFloat(dialog.style.top) + 563).toBeLessThanOrEqual(612);
    });
});
