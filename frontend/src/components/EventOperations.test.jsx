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
        const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);
        expect(headers.indexOf("Room")).toBeLessThan(headers.indexOf("Finance"));

        fireEvent.change(search, { target: { value: "does not exist" } });
        await waitFor(() => expect(screen.queryByRole("button", { name: /autumn workshop/i })).not.toBeInTheDocument());

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

    test("shows the canonical single-officer P/VP decision actions", async () => {
        const canonicalRequest = { ...request, status: "PVP_REVIEW" };
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url, options = {}) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) return Promise.resolve(apiResponse(canonicalRequest));
            if (url.endsWith("/event-requests/request-1")) return Promise.resolve(apiResponse(canonicalRequest));
            if (url.endsWith("/event-requests/request-1/advance")) return Promise.resolve(apiResponse({ ...canonicalRequest, status: "AGENDA" }));
            throw new Error(`Unexpected API request: ${url} ${options.method || "GET"}`);
        });

        render(<EventOperations can={(permission) => permission === "events.requests.view" || permission === "events.leadership.approve"} />);
        fireEvent.click(await screen.findByRole("button", { name: /autumn workshop/i }));
        fireEvent.click(await screen.findByRole("button", { name: "Advance to agenda" }));

        await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
            "/api/v1/event-requests/request-1/advance",
            expect.objectContaining({ method: "POST" }),
        ));
    });

    test("requires room booking before the board can proceed to finance", async () => {
        const agendaRequest = { ...request, status: "AGENDA" };
        vi.spyOn(global, "fetch").mockImplementation((url) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) return Promise.resolve(apiResponse(agendaRequest));
            if (url.endsWith("/event-requests/request-1")) return Promise.resolve(apiResponse(agendaRequest));
            throw new Error(`Unexpected API request: ${url}`);
        });

        render(<EventOperations can={() => true} />);
        fireEvent.click(await screen.findByRole("button", { name: /autumn workshop/i }));

        expect(screen.getByText("Complete room booking before proceeding to finance.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Record proceed" })).toBeDisabled();
    });

    test("does not ask for actual spend during finance review", async () => {
        const financeRequest = { ...request, status: "FINANCE_REVIEW" };
        vi.spyOn(global, "fetch").mockImplementation((url) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) return Promise.resolve(apiResponse(financeRequest));
            if (url.endsWith("/event-requests/request-1")) return Promise.resolve(apiResponse(financeRequest));
            throw new Error(`Unexpected API request: ${url}`);
        });

        render(<EventOperations can={() => true} />);
        fireEvent.click(await screen.findByRole("button", { name: /autumn workshop/i }));

        expect(await screen.findByRole("heading", { name: "Finance" })).toBeInTheDocument();
        expect(screen.queryByLabelText("Actual spend ($)")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Approved amount ($)")).toBeInTheDocument();
    });

    test("deletes a local preview request after explicit confirmation", async () => {
        const testRequest = { ...request };
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url, options = {}) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) return Promise.resolve(apiResponse(testRequest));
            if (url.endsWith("/event-requests/request-1")) return Promise.resolve(apiResponse(testRequest));
            if (url.endsWith("/event-requests/request-1/test-data")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ status: "success", cycle: { budgetCommittedCents: 0 } }),
                });
            }
            throw new Error(`Unexpected API request: ${url} ${options.method || "GET"}`);
        });
        vi.spyOn(window, "prompt").mockReturnValue("DELETE TEST REQUEST");

        render(<EventOperations can={() => true} adminPreview />);
        fireEvent.click(await screen.findByRole("button", { name: /autumn workshop/i }));
        fireEvent.click(await screen.findByRole("button", { name: "Delete preview request" }));

        await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith(
            "/api/v1/event-requests/request-1/test-data",
            expect.objectContaining({
                method: "DELETE",
                body: JSON.stringify({ confirmation: "DELETE TEST REQUEST" }),
            }),
        ));
        await waitFor(() => expect(screen.queryByRole("button", { name: /autumn workshop/i })).not.toBeInTheDocument());
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
        fireEvent.change(screen.getByRole("textbox", { name: "Event title" }), { target: { value: "Winter Social" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Requesting group" }), { target: { value: "Tech Committee" } });
        fireEvent.change(screen.getByLabelText("Event date"), { target: { value: "2026-12-15" } });
        fireEvent.change(screen.getByLabelText("Event time"), { target: { value: "18:00" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "HUB 145" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: "Estimated attendance" }), { target: { value: "40" } });
        fireEvent.change(screen.getByRole("spinbutton", { name: "Funding request ($)" }), { target: { value: "125.50" } });
        fireEvent.change(screen.getByRole("textbox", { name: "Event purpose" }), { target: { value: "A social event." } });
        fireEvent.click(screen.getByRole("button", { name: "Submit request" }));

        await waitFor(() => expect(fetchSpy).toHaveBeenLastCalledWith(
            "/api/v1/event-requests/",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    title: "Winter Social",
                    requestingGroup: "Tech Committee",
                    eventDate: "2026-12-15",
                    eventTime: "18:00",
                    location: "HUB 145",
                    purpose: "A social event.",
                    estimatedAttendance: 40,
                    marketingNotes: "",
                    fundingRequestedCents: 12550,
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
