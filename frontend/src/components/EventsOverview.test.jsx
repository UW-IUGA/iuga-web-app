/*
Purpose: Events overview (the former events page) behavior when details, RSVPs, and the event list arrive out of order, and when the photo viewer opens.
Authentication/Authorization Requirements: Auth context, runtime mode, and the API are mocked; no sign-in or network.
Expected Request Information: Event list, event details, and RSVP requests, each answered by the test.
Expected Response Information: The agenda, event dialog, and photo viewer a student sees.
*/
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import { toast } from "react-toastify";
import EventsPage from "./EventsOverview";

let isAuthenticated = true;
let permissions = new Set();

vi.mock("../runtime", () => ({ isProduction: true, apiBaseUrl: "" }));

vi.mock("../context/AuthContext", () => ({
    useAuthContext: () => ({ isAuthenticated, can: (permission) => permissions.has(permission) }),
}));

vi.mock("react-toastify", () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

// Local time, so the week shown does not depend on the machine's time zone.
const NOW = new Date(2026, 9, 13, 9, 0);

const GAME_NIGHT = {
    eId: "game-night",
    eName: "Game Night",
    eStartDate: new Date(2026, 9, 14, 17, 30).toISOString(),
    eLocation: "MGH 120",
    eOrganizers: "IUGA",
    eLabels: ["Social"],
};

const STUDY_JAM = {
    eId: "study-jam",
    eName: "Study Jam",
    eStartDate: new Date(2026, 9, 15, 12, 30).toISOString(),
    eLocation: "Odegaard 115",
    eOrganizers: "IUGA",
    eLabels: ["Academic"],
};

// What the details endpoint adds to a listed event.
const details = (listed, overrides = {}) => ({
    ...listed,
    eDescription: `About ${listed.eName}.`,
    rsvpEnabled: true,
    rsvpQuestions: [],
    hasRSVPd: false,
    showParticipants: false,
    eAltLink: null,
    ...overrides,
});

const jsonResponse = (body, { ok = true, status = 200, statusText = "OK" } = {}) => ({
    ok,
    status,
    statusText,
    json: async () => body,
});

// A request the test settles itself, so it can finish after a later one.
const pendingRequest = () => {
    const request = {};
    request.promise = new Promise((resolve, reject) => {
        request.resolve = resolve;
        request.reject = reject;
    });
    return request;
};

const renderEvents = () => {
    render(
        <MemoryRouter>
            <EventsPage />
        </MemoryRouter>,
    );
};

const openEvent = (name) => fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name},`) }));

const closeEvent = () => fireEvent.click(screen.getByRole("button", { name: "Close event details" }));

const rsvpCalls = (fetchSpy) => fetchSpy.mock.calls.filter(([url]) => url === "/api/v1/events/rsvp");

describe("Events page", () => {
    beforeEach(() => {
        isAuthenticated = true;
        permissions = new Set();
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
        vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    describe("opening and closing event details", () => {
        test("a failed request for an event that was closed and reopened does not close the newer dialog", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            const slowFirstRequest = pendingRequest();
            const newerRequest = pendingRequest();
            const detailRequests = [slowFirstRequest, newerRequest];
            vi.spyOn(global, "fetch").mockImplementation((url) =>
                url === "/api/v1/events/" ? Promise.resolve(jsonResponse([GAME_NIGHT])) : detailRequests.shift().promise,
            );
            renderEvents();
            await screen.findByRole("button", { name: /^Game Night,/ });

            openEvent("Game Night");
            closeEvent();
            openEvent("Game Night");
            await act(async () => slowFirstRequest.reject(new Error("500")));

            expect(toast.error).not.toHaveBeenCalled();
            expect(screen.getByRole("dialog", { name: "Game Night" })).toBeInTheDocument();
            expect(screen.getByText("Loading event details…")).toBeInTheDocument();
        });

        test("an earlier details response does not end loading while a newer request for the same event is pending", async () => {
            const slowFirstRequest = pendingRequest();
            const newerRequest = pendingRequest();
            const detailRequests = [slowFirstRequest, newerRequest];
            vi.spyOn(global, "fetch").mockImplementation((url) =>
                url === "/api/v1/events/" ? Promise.resolve(jsonResponse([GAME_NIGHT])) : detailRequests.shift().promise,
            );
            renderEvents();
            await screen.findByRole("button", { name: /^Game Night,/ });

            openEvent("Game Night");
            closeEvent();
            openEvent("Game Night");
            await act(async () => slowFirstRequest.resolve(jsonResponse(details(GAME_NIGHT))));

            expect(screen.getByText("Loading event details…")).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "RSVP" })).not.toBeInTheDocument();
        });

        test("a details response that arrives after the dialog was closed is ignored", async () => {
            const lateRequest = pendingRequest();
            vi.spyOn(global, "fetch").mockImplementation((url) =>
                url === "/api/v1/events/" ? Promise.resolve(jsonResponse([GAME_NIGHT])) : lateRequest.promise,
            );
            renderEvents();
            await screen.findByRole("button", { name: /^Game Night,/ });

            openEvent("Game Night");
            closeEvent();
            await act(async () => lateRequest.resolve(jsonResponse(details(GAME_NIGHT))));

            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            expect(toast.error).not.toHaveBeenCalled();
        });

        test("the details of the event opened last are shown when an earlier event's response arrives last", async () => {
            const gameNightRequest = pendingRequest();
            const studyJamRequest = pendingRequest();
            vi.spyOn(global, "fetch").mockImplementation((url) => {
                if (url === "/api/v1/events/") return Promise.resolve(jsonResponse([GAME_NIGHT, STUDY_JAM]));
                return url.endsWith(GAME_NIGHT.eId) ? gameNightRequest.promise : studyJamRequest.promise;
            });
            renderEvents();
            await screen.findByRole("button", { name: /^Game Night,/ });

            openEvent("Game Night");
            closeEvent();
            openEvent("Study Jam");
            await act(async () => studyJamRequest.resolve(jsonResponse(details(STUDY_JAM))));
            await act(async () => gameNightRequest.resolve(jsonResponse(details(GAME_NIGHT))));

            expect(screen.getByRole("dialog", { name: "Study Jam" })).toBeInTheDocument();
            expect(screen.getByText("About Study Jam.")).toBeInTheDocument();
            expect(screen.queryByText("About Game Night.")).not.toBeInTheDocument();
        });

        test("a deep link to an event that no longer exists shows an error and no dialog", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            vi.spyOn(global, "fetch").mockImplementation((url) =>
                url === "/api/v1/events/"
                    ? Promise.resolve(jsonResponse([GAME_NIGHT]))
                    : Promise.resolve(jsonResponse({ status: "error", message: "Event not found" }, { ok: false, status: 404, statusText: "Not Found" })),
            );
            render(
                <MemoryRouter initialEntries={[{ pathname: "/events", state: { eId: "gone", eStartDate: GAME_NIGHT.eStartDate } }]}>
                    <EventsPage />
                </MemoryRouter>,
            );

            await waitFor(() =>
                expect(toast.error).toHaveBeenCalledWith("We couldn't load this event's details. Please try again."),
            );
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    describe("RSVP state", () => {
        test("an RSVP that finishes after the student moved to another event does not mark that event as going", async () => {
            const rsvpRequest = pendingRequest();
            vi.spyOn(global, "fetch").mockImplementation((url) => {
                if (url === "/api/v1/events/") return Promise.resolve(jsonResponse([GAME_NIGHT, STUDY_JAM]));
                if (url === "/api/v1/events/rsvp") return rsvpRequest.promise;
                const listed = [GAME_NIGHT, STUDY_JAM].find((event) => url === `/api/v1/events/id/${event.eId}`);
                return Promise.resolve(jsonResponse(details(listed)));
            });
            renderEvents();
            await screen.findByRole("button", { name: /^Game Night,/ });

            openEvent("Game Night");
            fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));
            closeEvent();
            openEvent("Study Jam");
            await screen.findByRole("button", { name: "RSVP" });
            await act(async () => rsvpRequest.resolve(jsonResponse({ status: "success", message: "RSVP successful!" })));

            expect(toast.success).toHaveBeenCalledWith("RSVP successful!");
            expect(screen.getByRole("dialog", { name: "Study Jam" })).toBeInTheDocument();
            expect(screen.queryByText("You're on the list. See you there.")).not.toBeInTheDocument();
            expect(screen.getByRole("button", { name: "RSVP" })).toBeInTheDocument();
            expect(within(screen.getByRole("button", { name: /^Game Night,/ })).getByText("Going")).toBeInTheDocument();
        });

        test("an RSVP shows the going state in the agenda after the dialog closes", async () => {
            vi.spyOn(global, "fetch").mockImplementation((url) => {
                if (url === "/api/v1/events/") return Promise.resolve(jsonResponse([GAME_NIGHT]));
                if (url === "/api/v1/events/rsvp") return Promise.resolve(jsonResponse({ status: "success", message: "RSVP successful!" }));
                return Promise.resolve(jsonResponse(details(GAME_NIGHT)));
            });
            renderEvents();
            await screen.findByRole("button", { name: /^Game Night,/ });

            openEvent("Game Night");
            fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));
            await screen.findByText("You're on the list. See you there.");
            closeEvent();

            expect(within(screen.getByRole("button", { name: /^Game Night,/ })).getByText("Going")).toBeInTheDocument();
        });
    });

    describe("event list", () => {
        test("a list that arrives after a sign-in change replaces an older list that arrives later", async () => {
            const staleList = pendingRequest();
            let listRequests = 0;
            vi.spyOn(global, "fetch").mockImplementation(() => {
                listRequests += 1;
                return listRequests === 1 ? staleList.promise : Promise.resolve(jsonResponse([STUDY_JAM]));
            });
            const { rerender } = render(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );

            isAuthenticated = false;
            rerender(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            await screen.findByRole("button", { name: /^Study Jam,/ });
            await act(async () => staleList.resolve(jsonResponse([GAME_NIGHT, STUDY_JAM])));

            expect(screen.queryByRole("button", { name: /^Game Night,/ })).not.toBeInTheDocument();
            expect(screen.getByRole("button", { name: /^Study Jam,/ })).toBeInTheDocument();
        });
    });

    describe("loading the event list", () => {
        test("says events are loading, not that the week is empty, until the list arrives", async () => {
            const list = pendingRequest();
            vi.spyOn(global, "fetch").mockImplementation(() => list.promise);
            renderEvents();

            expect(screen.getByText("Loading events…")).toBeInTheDocument();
            expect(screen.queryByText("Nothing is scheduled this week.")).not.toBeInTheDocument();

            await act(async () => list.resolve(jsonResponse([GAME_NIGHT])));

            expect(screen.queryByText("Loading events…")).not.toBeInTheDocument();
            expect(screen.getByRole("button", { name: /^Game Night,/ })).toBeInTheDocument();
        });

        test("says the week is empty once a list without events for it has arrived", async () => {
            vi.spyOn(global, "fetch").mockResolvedValue(jsonResponse([]));
            renderEvents();

            expect(await screen.findByText("Nothing is scheduled this week.")).toBeInTheDocument();
        });

        test("says events could not be loaded when the request fails, and loads them on Try again", async () => {
            vi.spyOn(console, "error").mockImplementation(() => {});
            let listRequests = 0;
            vi.spyOn(global, "fetch").mockImplementation(() => {
                listRequests += 1;
                return Promise.resolve(
                    listRequests === 1
                        ? jsonResponse({}, { ok: false, status: 500, statusText: "Server Error" })
                        : jsonResponse([GAME_NIGHT]),
                );
            });
            renderEvents();

            expect(await screen.findByText("We couldn't load events. Please try again.")).toBeInTheDocument();
            expect(screen.queryByText("Nothing is scheduled this week.")).not.toBeInTheDocument();

            fireEvent.click(screen.getByRole("button", { name: "Try again" }));

            expect(await screen.findByRole("button", { name: /^Game Night,/ })).toBeInTheDocument();
            expect(screen.queryByText("We couldn't load events. Please try again.")).not.toBeInTheDocument();
        });
    });

    describe("event operations permissions", () => {
        test("the page grants only controls backed by the current permissions", async () => {
            permissions = new Set(["events.requests.manage", "events.finance.manage"]);
            const eventRequest = {
                _id: "request-1",
                eventName: "Autumn Workshop",
                requestingGroup: "Tech Committee",
                description: "A workshop for students.",
                proposedStartDate: "2026-10-15T18:00:00.000Z",
                status: "submitted",
                checkpoints: ["proposal", "meeting", "finance", "room", "marketing", "purchases", "completion", "review"]
                    .map((key) => ({ key, status: "pending" })),
            };
            vi.spyOn(global, "fetch").mockImplementation((url) => {
                if (url === "/api/v1/events/") return Promise.resolve(jsonResponse([GAME_NIGHT]));
                if (url === "/api/v1/event-requests") {
                    return Promise.resolve(jsonResponse({ status: "success", eventRequests: [eventRequest] }));
                }
                if (url === "/api/v1/event-requests/request-1") {
                    return Promise.resolve(jsonResponse({ status: "success", eventRequest }));
                }
                throw new Error(`Unexpected API request: ${url}`);
            });

            renderEvents();

            expect(await screen.findByRole("button", { name: /^Game Night,/ })).toBeInTheDocument();
            expect(await screen.findByRole("heading", { name: "Event operations" })).toBeInTheDocument();
            fireEvent.click(screen.getByRole("button", { name: /autumn workshop/i }));
            await screen.findByRole("heading", { name: "Autumn Workshop" });

            expect(screen.getByRole("button", { name: "Save finance" })).toBeInTheDocument();
            expect(screen.getByRole("combobox", { name: "Finance" })).toBeInTheDocument();
            expect(screen.queryByRole("button", { name: "Approve & publish" })).not.toBeInTheDocument();
            expect(screen.queryByRole("combobox", { name: "Proposal" })).not.toBeInTheDocument();
            expect(screen.queryByRole("combobox", { name: "Purchases" })).not.toBeInTheDocument();
        });
    });

    describe("closing and signing out", () => {
        test("Escape, the close button, and a click on the dimmed area each close the dialog, and the same event opens again", async () => {
            vi.spyOn(global, "fetch").mockImplementation((url) =>
                Promise.resolve(jsonResponse(url === "/api/v1/events/" ? [GAME_NIGHT] : details(GAME_NIGHT))),
            );
            renderEvents();
            await screen.findByRole("button", { name: /^Game Night,/ });

            openEvent("Game Night");
            await screen.findByText("About Game Night.");
            const dialog = screen.getByRole("dialog", { name: "Game Night" });
            act(() => {
                dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
                dialog.close();
            });
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

            openEvent("Game Night");
            await screen.findByText("About Game Night.");
            closeEvent();
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

            openEvent("Game Night");
            await screen.findByText("About Game Night.");
            fireEvent.click(screen.getByRole("dialog", { name: "Game Night" }));
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
            expect(toast.error).not.toHaveBeenCalled();
        });

        test("a student who signed out does not see the going state while the list reloads", async () => {
            const signedOutList = pendingRequest();
            let listRequests = 0;
            vi.spyOn(global, "fetch").mockImplementation(() => {
                listRequests += 1;
                return listRequests === 1
                    ? Promise.resolve(jsonResponse([{ ...GAME_NIGHT, hasRSVPd: true }]))
                    : signedOutList.promise;
            });
            const { rerender } = render(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            await screen.findByRole("button", { name: /^Game Night,/ });
            expect(within(screen.getByRole("button", { name: /^Game Night,/ })).getByText("Going")).toBeInTheDocument();

            isAuthenticated = false;
            rerender(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );

            expect(within(screen.getByRole("button", { name: /^Game Night,/ })).queryByText("Going")).not.toBeInTheDocument();
        });

        test("an open dialog stops saying the student is on the list when they sign out", async () => {
            vi.spyOn(global, "fetch").mockImplementation((url) =>
                Promise.resolve(jsonResponse(url === "/api/v1/events/" ? [GAME_NIGHT] : details(GAME_NIGHT, { hasRSVPd: true }))),
            );
            const { rerender } = render(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            await screen.findByRole("button", { name: /^Game Night,/ });
            openEvent("Game Night");
            await screen.findByText("You're on the list. See you there.");

            isAuthenticated = false;
            rerender(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );

            expect(screen.queryByText("You're on the list. See you there.")).not.toBeInTheDocument();
            expect(screen.getByRole("button", { name: "RSVP" })).toBeInTheDocument();
        });

        test("an RSVP sent before a different student signs in does not show that student as going", async () => {
            const rsvpRequest = pendingRequest();
            vi.spyOn(global, "fetch").mockImplementation((url) => {
                if (url === "/api/v1/events/") return Promise.resolve(jsonResponse([GAME_NIGHT]));
                if (url === "/api/v1/events/rsvp") return rsvpRequest.promise;
                return Promise.resolve(jsonResponse(details(GAME_NIGHT)));
            });
            const { rerender } = render(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            await screen.findByRole("button", { name: /^Game Night,/ });
            openEvent("Game Night");
            fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));
            closeEvent();

            isAuthenticated = false;
            rerender(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            isAuthenticated = true;
            rerender(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            await act(async () => rsvpRequest.resolve(jsonResponse({ status: "success", message: "RSVP successful!" })));

            expect(
                within(screen.getByRole("button", { name: /^Game Night,/ })).queryByText("Going"),
            ).not.toBeInTheDocument();
        });

        test("an RSVP still being sent when the student signs out does not show them as going", async () => {
            const rsvpRequest = pendingRequest();
            vi.spyOn(global, "fetch").mockImplementation((url) => {
                if (url === "/api/v1/events/") return Promise.resolve(jsonResponse([GAME_NIGHT]));
                if (url === "/api/v1/events/rsvp") return rsvpRequest.promise;
                return Promise.resolve(jsonResponse(details(GAME_NIGHT)));
            });
            const { rerender } = render(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            await screen.findByRole("button", { name: /^Game Night,/ });
            openEvent("Game Night");
            fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));
            closeEvent();

            isAuthenticated = false;
            rerender(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            await act(async () => rsvpRequest.resolve(jsonResponse({ status: "success", message: "RSVP successful!" })));

            expect(within(screen.getByRole("button", { name: /^Game Night,/ })).queryByText("Going")).not.toBeInTheDocument();
        });

        test("details that arrive after the list was reloaded still belong to the event that was opened", async () => {
            const lateDetails = pendingRequest();
            let listRequests = 0;
            vi.spyOn(global, "fetch").mockImplementation((url) => {
                if (url !== "/api/v1/events/") return lateDetails.promise;
                listRequests += 1;
                const list = listRequests === 1 ? [GAME_NIGHT] : [{ ...GAME_NIGHT, eName: "Game Night, moved" }];
                return Promise.resolve(jsonResponse(list));
            });
            const { rerender } = render(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            await screen.findByRole("button", { name: /^Game Night,/ });
            openEvent("Game Night");

            isAuthenticated = false;
            rerender(
                <MemoryRouter>
                    <EventsPage />
                </MemoryRouter>,
            );
            await screen.findByRole("button", { name: /^Game Night, moved,/ });
            await act(async () => lateDetails.resolve(jsonResponse(details(GAME_NIGHT))));

            expect(screen.getByRole("dialog", { name: "Game Night" })).toBeInTheDocument();
            expect(screen.getByText("About Game Night.")).toBeInTheDocument();
        });
    });

    describe("photo viewer", () => {
        test("a photo opened from a card starts at that photo, and the next set starts at its first photo", () => {
            vi.spyOn(global, "fetch").mockImplementation(() => Promise.resolve(jsonResponse([])));
            renderEvents();

            fireEvent.click(screen.getByRole("button", { name: "Open photo: Three students holding up stickers behind a table with laptops and flyers" }));
            expect(screen.getByRole("dialog", { name: "IUGA RSO Fair photos" })).toBeInTheDocument();
            expect(screen.getByText("3 / 9")).toBeInTheDocument();

            fireEvent.click(screen.getByRole("button", { name: "Close photos" }));
            fireEvent.click(screen.getAllByRole("button", { name: "View Photos" })[1]);

            expect(screen.getByRole("dialog", { name: "Meet IUGA photos" })).toBeInTheDocument();
            expect(screen.getByText("1 / 4")).toBeInTheDocument();
            expect(screen.getByText("September 2026")).toBeInTheDocument();
        });
    });
});
