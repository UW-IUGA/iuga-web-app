/*
Purpose: The RSVP block in a calendar event's detail: sign-in, the form in both versions, and the confirmed state.
Authentication/Authorization Requirements: Auth context, runtime mode, and the API are mocked; no sign-in or network.
Expected Request Information: Event details and RSVP requests, each answered by the test.
Expected Response Information: What a student sees about attending an event.
*/
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { normalizeEvent } from "../../utils/calendar/calendar";
import EventDetail from "./EventDetail";
import { PrototypeEventRsvpProvider } from "./PrototypeEventRsvpContext";

let isAuthenticated = true;
const signIn = vi.fn();

vi.mock("../../runtime", () => ({ isProduction: true, apiBaseUrl: "" }));

vi.mock("../../context/AuthContext", () => ({
    useAuthContext: () => ({ isAuthenticated, signIn }),
}));

const LISTED = {
    eId: "game-night",
    eName: "Game Night",
    eStartDate: new Date(Date.now() + 86_400_000).toISOString(),
    eLocation: "MGH 120",
    eLabels: ["Social"],
    eThumbnailPath: "/assets/events/game-night.webp",
};

const QUESTION = { qId: "diet", qString: "Any dietary restrictions?" };

const jsonResponse = (body) => ({ ok: true, status: 200, statusText: "OK", json: async () => body });

// Answers the details request with the given overrides, and every RSVP with rsvpReply.
const mockApi = (overrides = {}, rsvpReply = { status: "success", message: "RSVP recorded" }) => {
    global.fetch = vi.fn((url) => {
        if (url === "/api/v1/events/rsvp") {
            return Promise.resolve(jsonResponse(rsvpReply));
        }
        return Promise.resolve(
            jsonResponse({ ...LISTED, rsvpEnabled: true, rsvpQuestions: [], hasRSVPd: false, ...overrides }),
        );
    });
};

const renderDetail = ({ variant = 1, listed = LISTED } = {}) =>
    render(
        <PrototypeEventRsvpProvider variant={variant}>
            <EventDetail event={normalizeEvent(listed)} />
        </PrototypeEventRsvpProvider>,
    );

const rsvpRequests = () => global.fetch.mock.calls.filter(([url]) => url === "/api/v1/events/rsvp");

beforeEach(() => {
    isAuthenticated = true;
    signIn.mockReset();
});

describe("PrototypeEventRsvp", () => {
    it("shows the event's photo", async () => {
        mockApi();
        const { container } = renderDetail();
        expect(container.querySelector(".prototypeDetail__photo")).toHaveAttribute("src", LISTED.eThumbnailPath);
        await screen.findByRole("button", { name: "RSVP" });
    });

    it("asks a signed-out student to sign in, and sends no RSVP", async () => {
        isAuthenticated = false;
        mockApi();
        renderDetail();

        fireEvent.click(await screen.findByRole("button", { name: "Sign in to RSVP" }));

        expect(signIn).toHaveBeenCalledTimes(1);
        expect(rsvpRequests()).toHaveLength(0);
    });

    it("sends the answers and then shows the student is going", async () => {
        mockApi({ rsvpQuestions: [QUESTION] });
        renderDetail();

        fireEvent.change(await screen.findByLabelText(QUESTION.qString), { target: { value: "Vegetarian" } });
        fireEvent.click(screen.getByRole("button", { name: "RSVP" }));

        expect(await screen.findByText("You're going. See you there.")).toBeInTheDocument();
        expect(JSON.parse(rsvpRequests()[0][1].body)).toEqual({
            eId: "game-night",
            rsvpAnswers: [{ qId: "diet", aString: "Vegetarian" }],
        });
        expect(screen.queryByRole("button", { name: "RSVP" })).not.toBeInTheDocument();
    });

    it("explains a refused RSVP in the popup and keeps the button", async () => {
        mockApi({}, { status: "error", message: "This event is full." });
        renderDetail();

        fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("This event is full.");
        expect(screen.getByRole("button", { name: "RSVP" })).toBeEnabled();
        expect(screen.queryByText("You're going. See you there.")).not.toBeInTheDocument();
    });

    it("shows the confirmed state when the server says the student already RSVPd", async () => {
        mockApi({ hasRSVPd: true });
        renderDetail();
        expect(await screen.findByText("You're going. See you there.")).toBeInTheDocument();
    });

    it("offers no RSVP for an event that has already happened", async () => {
        mockApi();
        renderDetail({ listed: { ...LISTED, eStartDate: new Date(Date.now() - 86_400_000).toISOString() } });

        expect(screen.getByText("This event has already happened.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "RSVP" })).not.toBeInTheDocument();
    });

    it("in the compact version, opens the questions before sending anything", async () => {
        mockApi({ rsvpQuestions: [QUESTION] });
        renderDetail({ variant: 2 });

        expect(screen.queryByLabelText(QUESTION.qString)).not.toBeInTheDocument();
        fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));

        expect(screen.getByLabelText(QUESTION.qString)).toHaveFocus();
        expect(rsvpRequests()).toHaveLength(0);
    });

    it("in the compact version, RSVPs in one press when there is nothing to ask", async () => {
        mockApi();
        renderDetail({ variant: 2 });

        fireEvent.click(await screen.findByRole("button", { name: "RSVP" }));

        await waitFor(() => expect(rsvpRequests()).toHaveLength(1));
        expect(await screen.findByText("You're going. See you there.")).toBeInTheDocument();
    });

    it("links to the event's own sign-up page when it has no built-in RSVP", async () => {
        mockApi({ rsvpEnabled: false, eAltLink: { title: "Register on Handshake", url: "https://example.org" } });
        renderDetail();

        const link = await screen.findByRole("link", { name: /Register on Handshake/ });
        expect(link).toHaveAttribute("href", "https://example.org");
        expect(link).toHaveAttribute("target", "_blank");
    });
});
