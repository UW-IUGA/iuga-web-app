import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { toast } from "react-toastify";
import EventDialog from "./EventDialog";

let isAuthenticated = true;

vi.mock("../context/AuthContext", () => ({
    useAuthContext: () => ({ isAuthenticated }),
}));

vi.mock("react-toastify", () => ({
    toast: { error: vi.fn(), success: vi.fn() },
}));

const NOW = new Date(2026, 9, 13, 9, 0);

const makeEvent = (overrides = {}) => ({
    eId: "game-night",
    eName: "Game Night",
    eStartDate: new Date(2026, 9, 14, 17, 30).toISOString(),
    eLocation: "MGH 120",
    eOrganizers: "IUGA",
    eDescription: "Board games and snacks.",
    eLabels: ["Social"],
    rsvpEnabled: true,
    rsvpQuestions: [{ qId: "diet", qString: "Any dietary restrictions?" }],
    ...overrides,
});

const renderDialog = (event, props = {}) => {
    const handlers = { onRsvp: vi.fn(), onClose: vi.fn() };
    render(<EventDialog event={event} {...handlers} {...props} />);
    return handlers;
};

const rsvpResponse = (body) => ({ ok: true, json: async () => body });

describe("EventDialog", () => {
    beforeEach(() => {
        isAuthenticated = true;
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    test("shows when and where the event is, who hosts it, and its description", () => {
        renderDialog(makeEvent());

        expect(screen.getByRole("dialog", { name: "Game Night" })).toBeInTheDocument();
        expect(screen.getByText("Wednesday, October 14 at 5:30 PM")).toBeInTheDocument();
        expect(screen.getByText("MGH 120")).toBeInTheDocument();
        expect(screen.getByText("Hosted by IUGA")).toBeInTheDocument();
        expect(screen.getByText("Board games and snacks.")).toBeInTheDocument();
    });

    test("a signed-in student's RSVP sends their answers and reports success", async () => {
        const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
            rsvpResponse({ status: "success", message: "RSVP successful!" }),
        );
        const { onRsvp } = renderDialog(makeEvent());

        fireEvent.change(screen.getByLabelText("Any dietary restrictions?"), { target: { value: "None" } });
        fireEvent.click(screen.getByRole("button", { name: "RSVP" }));

        await waitFor(() => expect(onRsvp).toHaveBeenCalledTimes(1));
        expect(fetchSpy).toHaveBeenCalledWith("/api/v1/events/rsvp", expect.objectContaining({ method: "POST" }));
        expect(JSON.parse(fetchSpy.mock.calls[0][1].body)).toEqual({
            eId: "game-night",
            rsvpAnswers: [{ qId: "diet", aString: "None" }],
        });
        expect(toast.success).toHaveBeenCalledWith("RSVP successful!");
    });

    test("a signed-out visitor is asked to log in and nothing is sent", () => {
        isAuthenticated = false;
        const fetchSpy = vi.spyOn(global, "fetch");
        const { onRsvp } = renderDialog(makeEvent({ rsvpQuestions: [] }));

        fireEvent.click(screen.getByRole("button", { name: "RSVP" }));

        expect(toast.error).toHaveBeenCalledWith("Please login first to RSVP!");
        expect(fetchSpy).not.toHaveBeenCalled();
        expect(onRsvp).not.toHaveBeenCalled();
    });

    test("a rejected RSVP shows the server's message and does not mark the student as going", async () => {
        vi.spyOn(global, "fetch").mockResolvedValue(rsvpResponse({ status: "error", message: "Already registered" }));
        const { onRsvp } = renderDialog(makeEvent({ rsvpQuestions: [] }));

        fireEvent.click(screen.getByRole("button", { name: "RSVP" }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Already registered"));
        expect(onRsvp).not.toHaveBeenCalled();
    });

    test("a failed request tells the student to try again", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.spyOn(global, "fetch").mockRejectedValue(new Error("offline"));
        const { onRsvp } = renderDialog(makeEvent({ rsvpQuestions: [] }));

        fireEvent.click(screen.getByRole("button", { name: "RSVP" }));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith("RSVP was not successful :( Please try again."));
        expect(onRsvp).not.toHaveBeenCalled();
    });

    test("pressing RSVP again while the first press is being sent sends one request", async () => {
        let answerRequest;
        const fetchSpy = vi.spyOn(global, "fetch").mockReturnValue(
            new Promise((resolve) => {
                answerRequest = resolve;
            }),
        );
        const { onRsvp } = renderDialog(makeEvent({ rsvpQuestions: [] }));
        const rsvpButton = screen.getByRole("button", { name: "RSVP" });

        fireEvent.click(rsvpButton);
        fireEvent.click(rsvpButton);
        answerRequest(rsvpResponse({ status: "success", message: "RSVP successful!" }));

        await waitFor(() => expect(onRsvp).toHaveBeenCalledTimes(1));
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    test("a past event cannot be RSVPd to", () => {
        renderDialog(makeEvent({ eStartDate: new Date(2026, 9, 6, 16, 15).toISOString() }));

        expect(screen.getByText("This event has already happened.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "RSVP" })).not.toBeInTheDocument();
    });

    test("an event with its own sign-up page links to it instead of the RSVP form", () => {
        renderDialog(makeEvent({ rsvpEnabled: false, eAltLink: { title: "Register", url: "https://example.test/register" } }));

        expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "https://example.test/register");
        expect(screen.queryByRole("button", { name: "RSVP" })).not.toBeInTheDocument();
    });

    test("an event without RSVP says so", () => {
        renderDialog(makeEvent({ rsvpEnabled: false, eAltLink: { title: "", url: "" } }));

        expect(screen.getByText("RSVP is not available for this event.")).toBeInTheDocument();
    });

    test("no RSVP choice is offered while the details are still loading", () => {
        renderDialog(makeEvent({ rsvpEnabled: undefined }), { isLoading: true });

        expect(screen.getByText("Loading event details…")).toBeInTheDocument();
        expect(screen.queryByText("RSVP is not available for this event.")).not.toBeInTheDocument();
    });

    test("shows the participant count only when the event shares it", () => {
        renderDialog(makeEvent({ showParticipants: true, participants: 1 }));

        expect(screen.getByText("1 participant")).toBeInTheDocument();
    });

    test("a click inside the content leaves it open", () => {
        const { onClose } = renderDialog(makeEvent());

        fireEvent.click(screen.getByText("Board games and snacks."));

        expect(onClose).not.toHaveBeenCalled();
    });

    test("selecting text in the content and releasing on the dimmed area leaves it open", () => {
        const { onClose } = renderDialog(makeEvent());

        fireEvent.mouseDown(screen.getByText("Board games and snacks."));
        fireEvent.mouseUp(screen.getByRole("dialog"));
        fireEvent.click(screen.getByRole("dialog"));

        expect(onClose).not.toHaveBeenCalled();
    });
});
