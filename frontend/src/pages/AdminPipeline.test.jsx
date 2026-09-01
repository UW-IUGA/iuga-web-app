import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import AdminPipeline from "./AdminPipeline";
import { useAuthContext } from "../context/AuthContext";

vi.mock("../components/AdminRoute", () => ({ default: ({ children }) => children }));
vi.mock("../context/AuthContext", () => ({ useAuthContext: vi.fn() }));

const checkpoints = (completed = []) => ["proposal", "meeting", "room", "finance", "marketing", "purchases", "review"]
    .map((key) => ({ key, status: completed.includes(key) ? "completed" : "pending" }));

const requests = [
    { _id: "r1", eventName: "Formal", requestingGroup: "Social", proposedStartDate: "2026-04-01T00:00:00.000Z", status: "PVP_REVIEW", checkpoints: checkpoints() },
    { _id: "r2", eventName: "Mixer", requestingGroup: "Tech", proposedStartDate: "2026-05-01T00:00:00.000Z", status: "FINANCE_REVIEW", fundingRequestedCents: 20000, checkpoints: checkpoints(["proposal", "meeting", "room"]) },
    { _id: "r3", eventName: "Old Talk", requestingGroup: "Academic", proposedStartDate: "2025-01-01T00:00:00.000Z", status: "REVIEWED", checkpoints: checkpoints() },
    { _id: "r4", eventName: "Gala", requestingGroup: "Alumni", proposedStartDate: "2026-06-01T00:00:00.000Z", status: "SCHEDULED", publishedEventId: null, checkpoints: checkpoints(["proposal", "meeting", "room", "finance", "marketing"]) },
];

const mockList = () => vi.spyOn(global, "fetch").mockImplementation((url, options = {}) => {
    if (url.endsWith("/api/v1/event-requests")) return Promise.resolve({ ok: true, json: async () => ({ status: "success", eventRequests: requests }) });
    if (url.includes("/advance")) return Promise.resolve({ ok: true, json: async () => ({ status: "success", eventRequest: { ...requests[0], status: "AGENDA" } }) });
    if (url.includes("/publish")) return Promise.resolve({ ok: true, json: async () => ({ status: "success", eventRequest: { ...requests[3], publishedEventId: "event-4" } }) });
    throw new Error(`Unexpected request: ${url} ${options.method || "GET"}`);
});

describe("AdminPipeline", () => {
    afterEach(() => vi.restoreAllMocks());

    const renderBoard = () => render(<MemoryRouter><AdminPipeline /></MemoryRouter>);

    test("groups requests into stage columns and hides done requests by default", async () => {
        useAuthContext.mockReturnValue({ can: () => true, activeCycle: null });
        mockList();

        renderBoard();

        await screen.findByText("Formal");
        const pvpColumn = screen.getByRole("heading", { name: "P/VP review", level: 2 }).closest("section");
        expect(within(pvpColumn).getByText("Formal")).toBeInTheDocument();
        const financeColumn = screen.getByRole("heading", { name: "Finance", level: 2 }).closest("section");
        expect(within(financeColumn).getByText("Mixer")).toBeInTheDocument();

        expect(screen.queryByText("Old Talk")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /show done & archived/i }));
        expect(screen.getByText("Old Talk")).toBeInTheDocument();
    });

    test("a card quick-action advances a P/VP review request", async () => {
        useAuthContext.mockReturnValue({ can: (permission) => permission === "events.requests.view" || permission === "events.leadership.approve", activeCycle: null });
        const fetchSpy = mockList();

        renderBoard();

        fireEvent.click(await screen.findByRole("button", { name: "Advance" }));

        await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
            "/api/v1/event-requests/r1/advance",
            expect.objectContaining({ method: "POST" }),
        ));
    });

    test("finance cards expose the inline decision form once the room is booked", async () => {
        useAuthContext.mockReturnValue({ can: (permission) => permission === "events.requests.view" || permission === "events.finance.manage", activeCycle: null });
        mockList();

        renderBoard();

        await screen.findByText("Mixer");
        const financeColumn = screen.getByRole("heading", { name: "Finance", level: 2 }).closest("section");
        expect(within(financeColumn).getByRole("button", { name: "Record decision" })).toBeInTheDocument();
    });

    test("an unpublished scheduled event offers Publish to the PR director", async () => {
        useAuthContext.mockReturnValue({ can: (permission) => permission === "events.requests.view" || permission === "events.publication.manage", activeCycle: null });
        const fetchSpy = mockList();

        renderBoard();

        await screen.findByText("Gala");
        const column = screen.getByRole("heading", { name: "Publish & purchases", level: 2 }).closest("section");
        fireEvent.click(within(column).getByRole("button", { name: "Publish event" }));

        await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
            "/api/v1/event-requests/r4/publish",
            expect.objectContaining({ method: "POST" }),
        ));
    });
});
