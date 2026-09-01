import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import AdminRequest from "./AdminRequest";
import { useAuthContext } from "../context/AuthContext";

vi.mock("../components/AdminRoute", () => ({ default: ({ children }) => children }));
vi.mock("../context/AuthContext", () => ({ useAuthContext: vi.fn() }));

const ALL_CHECKPOINTS = ["proposal", "meeting", "room", "finance", "marketing", "purchases", "review"];

const makeRequest = ({ done = ["proposal", "meeting", "room"], ...overrides } = {}) => ({
    _id: "request-1",
    eventName: "Autumn Workshop",
    requestingGroup: "Tech Committee",
    purpose: "A workshop for students.",
    proposedStartDate: "2026-10-15T18:00:00.000Z",
    eventDate: "2026-10-15",
    status: "FINANCE_REVIEW",
    fundingRequestedCents: 12550,
    checkpoints: ALL_CHECKPOINTS.map((key) => ({ key, status: done.includes(key) ? "completed" : "pending" })),
    auditEntries: [{ _id: "audit-1", action: "advance", createdAt: "2026-09-01T00:00:00.000Z", comment: "Looks ready." }],
    ...overrides,
});

const past = { eventDate: "2020-01-01", proposedStartDate: "2020-01-01T00:00:00.000Z" };

const mockRequest = (eventRequest) => vi.spyOn(global, "fetch").mockResolvedValue({ ok: true, json: async () => ({ status: "success", eventRequest }) });

const renderPage = () => render(
    <MemoryRouter initialEntries={["/admin/pipeline/request-1"]}>
        <Routes>
            <Route path="/admin/pipeline/:id" element={<AdminRequest />} />
        </Routes>
    </MemoryRouter>,
);

describe("AdminRequest", () => {
    afterEach(() => vi.restoreAllMocks());

    test("shows the stepper, current-stage form, and collapsible panels", async () => {
        useAuthContext.mockReturnValue({ can: () => true });
        mockRequest(makeRequest());

        renderPage();

        expect(await screen.findByRole("heading", { name: "Autumn Workshop", level: 1 })).toBeInTheDocument();
        expect(screen.getByRole("list", { name: "Request progress" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Finance" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Room booking" })).toBeInTheDocument();
        expect(screen.getByText("Event record")).toBeInTheDocument();
        expect(screen.getByText("Decision history")).toBeInTheDocument();
    });

    test("shows Publish, not purchases, while a scheduled event is unpublished", async () => {
        useAuthContext.mockReturnValue({ can: () => true });
        mockRequest(makeRequest({ status: "SCHEDULED", done: ["proposal", "meeting", "room", "finance", "marketing"], ...past }));

        renderPage();

        await screen.findByRole("heading", { name: "Autumn Workshop", level: 1 });
        expect(screen.getByRole("heading", { name: "Publish" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Publish event" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Event purchases" })).not.toBeInTheDocument();
    });

    test("shows purchases after publishing, before the purchase log is posted", async () => {
        useAuthContext.mockReturnValue({ can: () => true });
        mockRequest(makeRequest({ status: "SCHEDULED", publishedEventId: "event-9", done: ["proposal", "meeting", "room", "finance", "marketing"], ...past }));

        renderPage();

        await screen.findByRole("heading", { name: "Autumn Workshop", level: 1 });
        expect(screen.getByRole("heading", { name: "Event purchases" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Post-event review" })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Publish" })).not.toBeInTheDocument();
    });

    test("shows the post-event review once every earlier step is done and the event has passed", async () => {
        useAuthContext.mockReturnValue({ can: (permission) => permission === "events.requests.view" || permission === "events.review.manage" });
        mockRequest(makeRequest({
            status: "SCHEDULED",
            publishedEventId: "event-9",
            done: ["proposal", "meeting", "room", "finance", "marketing", "purchases"],
            ...past,
        }));

        renderPage();

        expect(await screen.findByRole("heading", { name: "Post-event review" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Submit post-event review" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Event purchases" })).not.toBeInTheDocument();
    });

    test("does not show the review before the purchase log is posted, even after the event", async () => {
        useAuthContext.mockReturnValue({ can: () => true });
        mockRequest(makeRequest({
            status: "SCHEDULED",
            publishedEventId: "event-9",
            done: ["proposal", "meeting", "room", "finance", "marketing"],
            ...past,
        }));

        renderPage();

        await screen.findByRole("heading", { name: "Autumn Workshop", level: 1 });
        expect(screen.queryByRole("heading", { name: "Post-event review" })).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Event purchases" })).toBeInTheDocument();
    });

    test("gates officer forms behind permissions", async () => {
        useAuthContext.mockReturnValue({ can: (permission) => permission === "events.requests.view" });
        mockRequest(makeRequest());

        renderPage();

        await screen.findByRole("heading", { name: "Autumn Workshop", level: 1 });
        expect(screen.queryByRole("heading", { name: "Finance" })).not.toBeInTheDocument();
    });
});
