import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, test, vi } from "vitest";
import EventDetail from "./EventDetail";

const baseRequest = {
    _id: "request-1",
    eventName: "Autumn Workshop",
    requestingGroup: "Tech Committee",
    purpose: "A workshop for students.",
    proposedStartDate: "2026-10-15T18:00:00.000Z",
    status: "PVP_REVIEW",
    checkpoints: ["proposal", "meeting", "room", "finance", "marketing", "purchases", "review"].map((key) => ({ key, status: "pending" })),
};

const allow = () => true;

describe("EventDetail", () => {
    test("renders the request heading and status badge", () => {
        render(<EventDetail request={baseRequest} onUpdate={vi.fn()} can={allow} />);
        expect(screen.getByRole("heading", { name: "Autumn Workshop" })).toBeInTheDocument();
        expect(screen.getByText("PVP REVIEW")).toBeInTheDocument();
    });

    test("leadership can advance a P/VP review request", async () => {
        const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
            ok: true,
            json: async () => ({ status: "success", eventRequest: { ...baseRequest, status: "AGENDA" } }),
        });
        render(<EventDetail request={baseRequest} onUpdate={vi.fn()} can={(permission) => permission === "events.leadership.approve"} />);

        fireEvent.click(screen.getByRole("button", { name: "Advance to agenda" }));

        await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
            "/api/v1/event-requests/request-1/advance",
            expect.objectContaining({ method: "POST" }),
        ));
        fetchSpy.mockRestore();
    });

    test("hides officer forms when permissions are view-only", () => {
        render(<EventDetail request={baseRequest} onUpdate={vi.fn()} can={(permission) => permission === "events.requests.view"} />);
        expect(screen.queryByRole("button", { name: "Advance to agenda" })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Finance" })).not.toBeInTheDocument();
    });

    test("shows Publish and withholds purchases until a scheduled event is published", () => {
        const scheduled = { ...baseRequest, status: "SCHEDULED" };
        const { rerender } = render(<EventDetail request={scheduled} onUpdate={vi.fn()} can={allow} />);
        expect(screen.getByRole("heading", { name: "Publish" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Event purchases" })).not.toBeInTheDocument();

        rerender(<EventDetail request={{ ...scheduled, publishedEventId: "event-9" }} onUpdate={vi.fn()} can={allow} />);
        expect(screen.queryByRole("heading", { name: "Publish" })).not.toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Event purchases" })).toBeInTheDocument();
    });
});
