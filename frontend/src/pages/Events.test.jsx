/*
Purpose: Events page behavior: the calendar's views and navigation, kept in the URL, and the event list it loads.
Authentication/Authorization Requirements: Auth context, runtime mode, and the API are mocked; no sign-in or network.
Expected Request Information: The event list request, answered by the test.
Expected Response Information: The calendar a visitor sees, and its loading and failure states.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { formatMonthYear } from "../utils/calendar/calendar";
import EventsPage from "./Events";

let production = true;
let isAuthenticated = false;
let permissions = new Set();

vi.mock("../runtime", () => ({
    get isProduction() {
        return production;
    },
    apiBaseUrl: "",
}));

vi.mock("../context/AuthContext", () => ({
    useAuthContext: () => ({ isAuthenticated, can: (permission) => permissions.has(permission) }),
}));

const STUDY_JAM = {
    eId: "study-jam",
    eName: "Study Jam",
    eStartDate: "2026-10-20T17:00:00.000Z",
    eEndDate: "2026-10-20T18:30:00.000Z",
    eLocation: "MGH 120",
    eOrganizers: "IUGA",
    eDescription: "Bring your problem sets.",
    eLabels: ["Academic"],
};

const RESUME_CLINIC = {
    eId: "resume-clinic",
    eName: "Resume Clinic",
    eStartDate: "2026-10-22T01:00:00.000Z",
    eEndDate: "2026-10-22T02:00:00.000Z",
    eLabels: ["Career"],
};

const GAME_NIGHT_2024 = {
    eId: "game-night",
    eName: "IUGA Game Night",
    eStartDate: "2024-04-21T00:30:00.000Z",
    eLabels: ["Social"],
};

const SOCIAL_2020 = {
    eId: "social-2020",
    eName: "IUGA Community Social",
    eStartDate: "2020-10-10T19:20:00.000Z",
    eLabels: ["Social"],
};

const EVENTS = [STUDY_JAM, RESUME_CLINIC, GAME_NIGHT_2024, SOCIAL_2020];

const jsonResponse = (body, { ok = true, status = 200, statusText = "OK" } = {}) => ({
    ok,
    status,
    statusText,
    json: () => Promise.resolve(body),
});

// The page under a router opened at `url`, with what the router holds after
// each step, so a test can read the URL the calendar wrote.
let currentLocation;
function LocationProbe() {
    currentLocation = useLocation();
    return null;
}

const page = (url) => (
    <MemoryRouter initialEntries={[url]}>
        <Routes>
            <Route
                path="/events"
                element={
                    <>
                        <EventsPage />
                        <LocationProbe />
                    </>
                }
            />
        </Routes>
    </MemoryRouter>
);

// Renders the page and lets the list request settle.
async function visit(url = "/events") {
    const view = render(page(url));
    await act(async () => {});
    return view;
}

const written = () => new URLSearchParams(currentLocation.search);
const range = (container) => container.querySelector(".toolbar__range").textContent;
const miniLabel = (container) => container.querySelector(".mini__label").textContent;

let fetchSpy;

beforeEach(() => {
    production = true;
    isAuthenticated = false;
    permissions = new Set();
    fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse(EVENTS));
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.scrollTo = vi.fn();
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.matchMedia;
});

describe("Events page: the event list", () => {
    it("shows the events the list request returns", async () => {
        await visit("/events?date=2026-10-20");

        expect(fetchSpy).toHaveBeenCalledWith("/api/v1/events/", { method: "GET" });
        expect(screen.getByRole("button", { name: /Study Jam/ })).toBeInTheDocument();
    });

    it("says it is loading until the list arrives, without claiming the month is empty", async () => {
        let answer;
        fetchSpy.mockReturnValue(new Promise((resolve) => (answer = resolve)));
        render(page("/events?date=2026-10-20"));

        expect(screen.getByRole("status")).toHaveTextContent("Loading events…");

        await act(async () => answer(jsonResponse(EVENTS)));

        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Study Jam/ })).toBeInTheDocument();
    });

    it("says events could not be loaded when the request fails, and loads them on Try again", async () => {
        fetchSpy.mockResolvedValueOnce(jsonResponse(null, { ok: false, status: 500, statusText: "Server Error" }));
        await visit("/events?date=2026-10-20");

        expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load events. Please try again.");
        expect(screen.queryByRole("button", { name: /Study Jam/ })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await act(async () => {});

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Study Jam/ })).toBeInTheDocument();
    });

    it("loads the list again on signing in, keeping the calendar up meanwhile", async () => {
        const { rerender } = await visit("/events?date=2026-10-20");
        let answer;
        fetchSpy.mockReturnValue(new Promise((resolve) => (answer = resolve)));

        isAuthenticated = true;
        rerender(page("/events?date=2026-10-20"));

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Study Jam/ })).toBeInTheDocument();

        await act(async () => answer(jsonResponse([STUDY_JAM])));
        expect(screen.queryByRole("button", { name: /Resume Clinic/ })).not.toBeInTheDocument();
    });

    it("shows a Career event as Professional", async () => {
        await visit("/events?view=day&date=2026-10-21");

        const agenda = screen.getByRole("article");
        expect(within(agenda).getByText("Resume Clinic")).toBeInTheDocument();
        expect(within(agenda).getByText("Professional")).toBeInTheDocument();
        expect(within(agenda).queryByText("Career")).not.toBeInTheDocument();
    });

    it("lists only the categories a visitor can see in the colour key", async () => {
        await visit("/events?date=2026-10-20");

        const [legend] = screen.getAllByRole("list", { name: "Event colours" });
        expect(
            within(legend)
                .getAllByRole("listitem")
                .map((item) => item.textContent),
        ).toEqual(["Academic", "Social", "Professional"]);
    });

    it("shows the sample events without a request outside production", async () => {
        production = false;
        await visit("/events?date=2024-04-20");

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: /IUGA Game Night/ })).toBeInTheDocument();
    });
});

describe("Events page: officer event operations", () => {
    const EVENT_REQUEST = {
        _id: "request-1",
        eventName: "Autumn Workshop",
        requestingGroup: "Tech Committee",
        description: "A workshop for students.",
        proposedStartDate: "2026-10-15T18:00:00.000Z",
        status: "submitted",
        checkpoints: ["proposal", "meeting", "finance", "room", "marketing", "purchases", "completion", "review"].map(
            (key) => ({ key, status: "pending" }),
        ),
    };

    it("keeps an officer's event operations under the calendar, with only the controls their permissions allow", async () => {
        isAuthenticated = true;
        permissions = new Set(["events.requests.manage", "events.finance.manage"]);
        fetchSpy.mockImplementation((url) => {
            if (url === "/api/v1/events/") return Promise.resolve(jsonResponse(EVENTS));
            if (url === "/api/v1/event-requests") {
                return Promise.resolve(jsonResponse({ status: "success", eventRequests: [EVENT_REQUEST] }));
            }
            if (url === "/api/v1/event-requests/request-1") {
                return Promise.resolve(jsonResponse({ status: "success", eventRequest: EVENT_REQUEST }));
            }
            throw new Error(`Unexpected API request: ${url}`);
        });
        await visit("/events?date=2026-10-20");

        expect(await screen.findByRole("heading", { name: "Event operations" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /autumn workshop/i }));
        await screen.findByRole("heading", { name: "Autumn Workshop" });

        expect(screen.getByRole("button", { name: "Save finance" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Approve & publish" })).not.toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "Purchases" })).not.toBeInTheDocument();
    });

    it("shows a visitor only the calendar", async () => {
        await visit("/events?date=2026-10-20");

        expect(screen.queryByRole("heading", { name: "Event operations" })).not.toBeInTheDocument();
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});

describe("Events page: views and navigation", () => {
    it("opens on the month view with no params", async () => {
        const { container } = await visit("/events");

        expect(container.querySelector(".card")).toBeTruthy();
        expect(screen.getByRole("radio", { name: "Month" })).toHaveAttribute("aria-checked", "true");
    });

    it("shows the whole archive in year view, across every year, with no mini month", async () => {
        const { container } = await visit("/events?view=year&date=2026-10-20");

        // The visible title: the current month's heading also carries a hidden
        // ", this month" that the real clock decides.
        const titles = [...container.querySelectorAll(".card-title__heading")].map(
            (node) => node.firstChild.textContent,
        );
        expect(titles.some((title) => title.endsWith("2024"))).toBe(true);
        expect(titles.some((title) => title.endsWith("2020"))).toBe(true);
        expect(container.querySelector(".mini")).toBeNull();
    });

    it("shows the mini month in month, week and day view", async () => {
        for (const url of [
            "/events?date=2026-10-20",
            "/events?view=week&date=2026-10-20",
            "/events?view=day&date=2026-10-20",
        ]) {
            const { container, unmount } = await visit(url);
            expect(container.querySelector(".mini")).toBeTruthy();
            unmount();
        }
    });

    it("puts Today and the arrows in the toolbar, not the sidebar", async () => {
        const { container } = await visit("/events?date=2026-10-20");

        const toolbar = container.querySelector(".toolbar");
        expect(within(toolbar).getByRole("button", { name: "Today" })).toBeInTheDocument();
        expect(within(toolbar).getByRole("button", { name: "Previous month" })).toBeInTheDocument();
        expect(within(toolbar).getByRole("button", { name: "Next month" })).toBeInTheDocument();
        expect(within(container.querySelector(".mini")).queryByRole("button", { name: "Today" })).toBeNull();
    });

    it("carries the mini month along when the toolbar steps into another month", async () => {
        const { container } = await visit("/events?date=2026-10-20");

        fireEvent.click(screen.getByRole("button", { name: "Next month" }));

        expect(range(container)).toBe("November 2026");
        expect(miniLabel(container)).toBe("November 2026");
        expect(written().get("date")).toBe("2026-11-20");
    });

    it("leaves the main view and the URL alone when the mini month browses", async () => {
        const { container } = await visit("/events?view=week&date=2026-10-20");

        fireEvent.click(within(container.querySelector(".mini")).getByRole("button", { name: "Show previous month" }));

        expect(miniLabel(container)).toBe("September 2026");
        expect(range(container)).toBe("Oct 18 – Oct 24, 2026");
        expect(written().get("date")).toBe("2026-10-20");
    });

    it("moves the current view to a day picked in the mini month", async () => {
        const cases = [
            ["/events?date=2026-10-20", "October 2026", null],
            ["/events?view=week&date=2026-10-20", "Oct 25 – Oct 31, 2026", "week"],
            ["/events?view=day&date=2026-10-20", "Wed, Oct 28, 2026", "day"],
        ];

        for (const [url, expected, view] of cases) {
            const { container, unmount } = await visit(url);
            const day = [...container.querySelectorAll(".mini__day:not(.mini__day--out)")].find((cell) =>
                cell.textContent.startsWith("28"),
            );

            fireEvent.click(day);

            expect(written().get("view")).toBe(view);
            expect(written().get("date")).toBe("2026-10-28");
            expect(range(container)).toBe(expected);
            unmount();
        }
    });

    it("brings a browsed mini month back with a toolbar step", async () => {
        const { container } = await visit("/events?view=week&date=2026-10-13");

        fireEvent.click(within(container.querySelector(".mini")).getByRole("button", { name: "Show next month" }));
        fireEvent.click(screen.getByRole("button", { name: "Next week" }));

        // The step stays inside October, and the sidebar comes home with it.
        expect(range(container)).toBe("Oct 18 – Oct 24, 2026");
        expect(miniLabel(container)).toBe("October 2026");
    });

    it("brings a browsed mini month back with Today, even when already on today", async () => {
        const { container } = await visit("/events");
        const home = miniLabel(container);

        fireEvent.click(within(container.querySelector(".mini")).getByRole("button", { name: "Show next month" }));
        expect(miniLabel(container)).not.toBe(home);

        fireEvent.click(screen.getByRole("button", { name: "Today" }));

        expect(miniLabel(container)).toBe(home);
    });

    it("shows seven days in week view, and one with its agenda in day view", async () => {
        const week = await visit("/events?view=week&date=2026-10-20");
        expect(week.container.querySelectorAll(".grid__col")).toHaveLength(7);
        week.unmount();

        const day = await visit("/events?view=day&date=2026-10-20");
        expect(day.container.querySelectorAll(".grid__col")).toHaveLength(1);
        expect(day.container.querySelector(".day__agenda")).toBeTruthy();
    });

    it("switches view from the toggle, keeping the date", async () => {
        const { container } = await visit("/events?date=2026-10-20");

        fireEvent.click(screen.getByRole("radio", { name: "Week" }));
        expect(written().get("view")).toBe("week");
        expect(written().get("date")).toBe("2026-10-20");
        expect(container.querySelectorAll(".grid__col")).toHaveLength(7);

        fireEvent.click(screen.getByRole("radio", { name: "Year" }));
        expect(written().get("view")).toBe("year");
        expect(container.querySelector(".mini")).toBeNull();
    });

    it("opens a day when a month pad is clicked", async () => {
        const { container } = await visit("/events?date=2026-10-20");

        fireEvent.click(container.querySelector(".pad__open"));

        expect(written().get("view")).toBe("day");
    });

    it("takes the month and week views to the current period from Today", async () => {
        const month = await visit("/events?date=2024-04-08");
        fireEvent.click(screen.getByRole("button", { name: "Today" }));
        expect(written().get("view")).toBeNull();
        expect(range(month.container)).toBe(formatMonthYear(new Date()));
        month.unmount();

        const week = await visit("/events?view=week&date=2024-04-08");
        fireEvent.click(screen.getByRole("button", { name: "Today" }));
        expect(written().get("view")).toBe("week");
        // The current week is the one with today's column in it.
        expect(week.container.querySelector(".grid__dayhead--today")).toBeTruthy();
    });

    it("gives every view one h1, with the months below it as h2s", async () => {
        await visit("/events?view=year&date=2026-10-20");

        expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
        expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(1);
    });
});

describe("Events page: keyboard", () => {
    it("makes the view toggle a single tab stop (radio group)", async () => {
        await visit("/events?date=2026-10-20");

        const options = within(screen.getByRole("radiogroup")).getAllByRole("radio");
        expect(options.filter((option) => option.tabIndex === 0).map((option) => option.textContent)).toEqual([
            "Month",
        ]);
    });

    it("moves between views with the arrow keys, keeping focus on the toggle", async () => {
        await visit("/events?date=2026-10-20");

        const month = screen.getByRole("radio", { name: "Month" });
        month.focus();
        fireEvent.keyDown(month, { key: "ArrowRight" });

        expect(written().get("view")).toBe("week");
        expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Week" }));

        fireEvent.keyDown(document.activeElement, { key: "Home" });
        expect(written().get("view")).toBe("year");

        // Wraps from the first view to the last.
        fireEvent.keyDown(document.activeElement, { key: "ArrowLeft" });
        expect(written().get("view")).toBe("day");
    });

    it("lets a keyboard reach the scrolling schedule (2.1.1)", async () => {
        await visit("/events?view=week&date=2026-10-20");

        expect(screen.getByRole("region", { name: "Schedule" }).tabIndex).toBe(0);
    });
});

describe("Events page: swiping across the calendar", () => {
    // jsdom's TouchEvent will not take plain touch points, so the event is a
    // plain one carrying them. `clientX` defaults to mid-screen, clear of the
    // edge band left to the browser.
    const touch = (el, type, points) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, "touches", { value: points });
        el.dispatchEvent(event);
        return event;
    };
    const swipe = (el, dx, dy = 0, startX = 500) => {
        touch(el, "touchstart", [{ clientX: startX, clientY: 300 }]);
        const move = touch(el, "touchmove", [{ clientX: startX + dx, clientY: 300 + dy }]);
        touch(el, "touchend", []);
        return move;
    };

    // Under reduced motion a swipe steps at once, with nothing to wait out.
    beforeEach(() => {
        window.matchMedia = (query) => ({
            matches: query.includes("reduce"),
            media: query,
            addEventListener() {},
            removeEventListener() {},
        });
    });

    const main = (container) => container.querySelector(".events__main");

    it("steps to the next week for a swipe left, and back for one right", async () => {
        const { container } = await visit("/events?view=week&date=2026-10-20");

        await act(async () => swipe(main(container), -120));
        expect(range(container)).toBe("Oct 25 – Oct 31, 2026");

        await act(async () => swipe(main(container), 120));
        expect(range(container)).toBe("Oct 18 – Oct 24, 2026");
    });

    it("steps the month and the day view too, by their own unit", async () => {
        const month = await visit("/events?date=2026-10-20");
        await act(async () => swipe(main(month.container), -120));
        expect(range(month.container)).toBe("November 2026");
        month.unmount();

        const day = await visit("/events?view=day&date=2026-10-20");
        await act(async () => swipe(main(day.container), -120));
        expect(range(day.container)).toBe("Wed, Oct 21, 2026");
    });

    it("claims the sideways move, so the page does not pan under it", async () => {
        const { container } = await visit("/events?view=week&date=2026-10-20");

        expect(swipe(main(container), -120).defaultPrevented).toBe(true);
    });

    it("leaves a downward move to the scroll, and a short one alone", async () => {
        const { container } = await visit("/events?view=week&date=2026-10-20");

        const scroll = await act(async () => swipe(main(container), -30, 120));
        expect(scroll.defaultPrevented).toBe(false);
        await act(async () => swipe(main(container), -30));

        expect(range(container)).toBe("Oct 18 – Oct 24, 2026");
    });

    it("ignores a swipe from the screen's edge, which is the browser's back swipe", async () => {
        const { container } = await visit("/events?view=week&date=2026-10-20");

        await act(async () => swipe(main(container), 120, 0, 5));

        expect(range(container)).toBe("Oct 18 – Oct 24, 2026");
    });

    it("does not swipe the year view, which does not step", async () => {
        const { container } = await visit("/events?view=year&date=2026-10-20");

        expect(swipe(main(container), -120).defaultPrevented).toBe(false);
    });

    it("keeps the arrows, the single-tap way to do the same (2.5.1)", async () => {
        await visit("/events?view=week&date=2026-10-20");

        expect(screen.getByRole("button", { name: "Previous week" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Next week" })).toBeInTheDocument();
    });
});
