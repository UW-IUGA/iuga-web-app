import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import EventsPage from "./Events";
import { useAuthContext } from "../context/AuthContext";

jest.mock("../context/AuthContext", () => ({
    useAuthContext: jest.fn(),
}));
jest.mock("../components/Calendar", () => () => <div>Public events calendar</div>);
jest.mock("react-responsive", () => ({ children }) => <>{children}</>);

const request = {
    _id: "request-1",
    eventName: "Autumn Workshop",
    requestingGroup: "Tech Committee",
    description: "A workshop for students.",
    proposedStartDate: "2026-10-15T18:00:00.000Z",
    status: "submitted",
    checkpoints: ["proposal", "meeting", "finance", "room", "marketing", "purchases", "completion", "review"]
        .map((key) => ({ key, status: "pending" })),
};

describe("EventsPage", () => {
    afterEach(() => jest.restoreAllMocks());

    test("keeps the public calendar and reveals operations to an officer", async () => {
        useAuthContext.mockReturnValue({ isAuthenticated: true, isAdmin: true });
        jest.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            json: async () => ({ status: "success", eventRequests: [request] }),
        });
        jest.spyOn(window, "scrollTo").mockImplementation(() => {});

        render(<MemoryRouter><EventsPage /></MemoryRouter>);

        expect(screen.getByText("Public events calendar")).toBeInTheDocument();
        expect(await screen.findByRole("heading", { name: "Event operations" })).toBeInTheDocument();
        expect(await screen.findByText("Autumn Workshop")).toBeInTheDocument();
    });

    test("keeps officer operations out of the public Events page", async () => {
        useAuthContext.mockReturnValue({ isAuthenticated: false, isAdmin: false });
        const fetchSpy = jest.spyOn(global, "fetch");
        jest.spyOn(window, "scrollTo").mockImplementation(() => {});

        render(<MemoryRouter><EventsPage /></MemoryRouter>);

        await waitFor(() => expect(screen.getByText("Public events calendar")).toBeInTheDocument());
        expect(screen.queryByRole("heading", { name: "Event operations" })).not.toBeInTheDocument();
        expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining("event-requests"), expect.anything());
    });
});
