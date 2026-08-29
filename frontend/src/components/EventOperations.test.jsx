import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import EventOperations from "./EventOperations";

const request = {
    _id: "request-1",
    eventName: "Autumn Workshop",
    requestingGroup: "Tech Committee",
    description: "A workshop for students.",
    proposedStartDate: "2026-10-15T18:00:00.000Z",
    status: "submitted",
    checkpoints: [
        "proposal",
        "meeting",
        "finance",
        "room",
        "marketing",
        "purchases",
        "completion",
        "review",
    ].map((key) => ({ key, status: "pending" })),
};

const apiResponse = (eventRequest = request) => ({
    ok: true,
    json: async () => ({ status: "success", eventRequest, eventRequests: [eventRequest] }),
});

describe("EventOperations", () => {
    afterEach(() => vi.restoreAllMocks());

    test("an officer can find a request, open its details, and update a checkpoint", async () => {
        const updatedRequest = {
            ...request,
            checkpoints: request.checkpoints.map((checkpoint) =>
                checkpoint.key === "meeting" ? { ...checkpoint, status: "completed" } : checkpoint,
            ),
        };
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url, options = {}) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) return Promise.resolve(apiResponse());
            if (url.endsWith("/event-requests/request-1")) return Promise.resolve(apiResponse());
            if (url.endsWith("/event-requests/request-1/checklist/meeting")) return Promise.resolve(apiResponse(updatedRequest));
            throw new Error(`Unexpected API request: ${url} ${options.method || "GET"}`);
        });

        render(<EventOperations isAdmin />);

        const search = await screen.findByRole("textbox", { name: "Search" });
        await screen.findByRole("button", { name: /autumn workshop/i });

        fireEvent.change(search, { target: { value: "does not exist" } });
        expect(screen.queryByRole("button", { name: /autumn workshop/i })).not.toBeInTheDocument();

        fireEvent.change(search, { target: { value: "autumn" } });
        fireEvent.click(await screen.findByRole("button", { name: /autumn workshop/i }));
        expect(await screen.findByRole("button", { name: "Approve & publish" })).toBeInTheDocument();

        fireEvent.change(screen.getByRole("combobox", { name: "Meeting" }), { target: { value: "completed" } });

        await waitFor(() => expect(screen.getByRole("combobox", { name: "Meeting" })).toHaveValue("completed"));
        expect(fetchSpy).toHaveBeenCalledWith(
            "/api/v1/event-requests/request-1/checklist/meeting",
            expect.objectContaining({
                method: "PATCH",
                body: JSON.stringify({ status: "completed" }),
            }),
        );
    });

    test("submits a request without sending blank optional fields", async () => {
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url, options = {}) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) {
                return Promise.resolve(apiResponse());
            }
            throw new Error(`Unexpected API request: ${url} ${options.method || "GET"}`);
        });

        render(<EventOperations isAdmin />);
        fireEvent.click(await screen.findByRole("button", { name: /new event request/i }));
        fireEvent.change(screen.getByRole("textbox", { name: "Event name" }), { target: { value: "Winter Social" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Requesting group" }), { target: { value: "Tech Committee" } });
        fireEvent.change(screen.getByLabelText("Proposed start"), { target: { value: "2026-12-15T18:00" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Description" }), { target: { value: "A social event." } });
        fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

        await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(
            "/api/v1/event-requests/",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    eventName: "Winter Social",
                    requestingGroup: "Tech Committee",
                    description: "A social event.",
                    proposedStartDate: "2026-12-15T18:00",
                }),
            }),
        ));
    });

    test("students are not offered officer controls and do not load request data", () => {
        const fetchSpy = vi.spyOn(global, "fetch");

        render(<EventOperations isAdmin={false} />);

        expect(screen.queryByRole("button", { name: /new event request/i })).not.toBeInTheDocument();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    test("shows only controls granted by the current permissions", async () => {
        vi.spyOn(global, "fetch").mockImplementation((url) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) return Promise.resolve(apiResponse());
            if (url.endsWith("/event-requests/request-1")) return Promise.resolve(apiResponse());
            throw new Error(`Unexpected API request: ${url}`);
        });

        const can = (permission) => permission === "events.requests.view";
        render(<EventOperations can={can} />);

        expect(await screen.findByRole("button", { name: /autumn workshop/i })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /new event request/i })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /autumn workshop/i }));
        expect(screen.getByText("Request detail")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Approve & publish" })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Finance" })).not.toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Meeting" })).toBeDisabled();
    });
});
