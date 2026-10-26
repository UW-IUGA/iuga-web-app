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

        render(
            <EventOperations
                canManageRequests
                canApproveLeadership
                canManageFinance
                canCompletePurchases
            />,
        );

        const search = await screen.findByRole("textbox", { name: "Search" });
        await screen.findByRole("button", { name: /autumn workshop/i });

        fireEvent.change(search, { target: { value: "does not exist" } });
        expect(screen.queryByRole("button", { name: /autumn workshop/i })).not.toBeInTheDocument();

        fireEvent.change(search, { target: { value: "autumn" } });
        fireEvent.click(await screen.findByRole("button", { name: /autumn workshop/i }));
        expect(await screen.findByRole("button", { name: "Approve & publish" })).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Proposal" })).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Finance" })).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Purchases" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save finance" })).toBeInTheDocument();

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

    test("request managers cannot edit leadership, finance, or purchases work", async () => {
        const managerRequest = {
            ...request,
            finance: { allocatedCents: 10000, actualSpendCents: 2500, notes: "Grant funding" },
        };
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) return Promise.resolve(apiResponse(managerRequest));
            if (url.endsWith("/event-requests/request-1")) return Promise.resolve(apiResponse(managerRequest));
            if (["/checklist/meeting", "/booking", "/review-tracking"].some((path) => url.endsWith(`/event-requests/request-1${path}`))) {
                return Promise.resolve(apiResponse(managerRequest));
            }
            throw new Error(`Unexpected API request: ${url}`);
        });

        render(<EventOperations canManageRequests />);
        fireEvent.click(await screen.findByRole("button", { name: /autumn workshop/i }));

        expect(await screen.findByRole("heading", { name: "Autumn Workshop" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Approve & publish" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Save finance" })).not.toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "Proposal" })).not.toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "Finance" })).not.toBeInTheDocument();
        expect(screen.queryByRole("combobox", { name: "Purchases" })).not.toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Meeting" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save booking" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save review tracking" })).toBeInTheDocument();
        expect(screen.getByText("Allocated: $100.00")).toBeInTheDocument();
        expect(screen.getByText("Actual spend: $25.00")).toBeInTheDocument();
        expect(screen.getByText("Finance notes: Grant funding")).toBeInTheDocument();

        fireEvent.change(screen.getByRole("combobox", { name: "Meeting" }), { target: { value: "completed" } });
        fireEvent.click(screen.getByRole("button", { name: "Save booking" }));
        fireEvent.click(screen.getByRole("button", { name: "Save review tracking" }));

        await waitFor(() => {
            expect(fetchSpy).toHaveBeenCalledWith(
                "/api/v1/event-requests/request-1/checklist/meeting",
                expect.objectContaining({ method: "PATCH" }),
            );
            expect(fetchSpy).toHaveBeenCalledWith(
                "/api/v1/event-requests/request-1/booking",
                expect.objectContaining({ method: "PATCH" }),
            );
            expect(fetchSpy).toHaveBeenCalledWith(
                "/api/v1/event-requests/request-1/review-tracking",
                expect.objectContaining({ method: "PATCH" }),
            );
        });
    });

    test.each([
        {
            permission: "leadership",
            props: { canApproveLeadership: true },
            editableCheckpoint: "Proposal",
            readOnlyCheckpoints: ["Finance", "Purchases"],
            canApprove: true,
            canSaveFinance: false,
        },
        {
            permission: "finance",
            props: { canManageFinance: true },
            editableCheckpoint: "Finance",
            readOnlyCheckpoints: ["Proposal", "Purchases"],
            canApprove: false,
            canSaveFinance: true,
        },
        {
            permission: "purchases",
            props: { canCompletePurchases: true },
            editableCheckpoint: "Purchases",
            readOnlyCheckpoints: ["Proposal", "Finance"],
            canApprove: false,
            canSaveFinance: false,
        },
    ])("request managers with only $permission permission can edit its protected work", async ({
        props,
        editableCheckpoint,
        readOnlyCheckpoints,
        canApprove,
        canSaveFinance,
    }) => {
        vi.spyOn(global, "fetch").mockImplementation((url) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) return Promise.resolve(apiResponse());
            if (url.endsWith("/event-requests/request-1")) return Promise.resolve(apiResponse());
            throw new Error(`Unexpected API request: ${url}`);
        });

        render(<EventOperations canManageRequests {...props} />);
        fireEvent.click(await screen.findByRole("button", { name: /autumn workshop/i }));
        await screen.findByRole("heading", { name: "Autumn Workshop" });

        expect(screen.getByRole("combobox", { name: editableCheckpoint })).toBeInTheDocument();
        for (const checkpoint of readOnlyCheckpoints) {
            expect(screen.queryByRole("combobox", { name: checkpoint })).not.toBeInTheDocument();
        }
        expect(Boolean(screen.queryByRole("button", { name: "Approve & publish" }))).toBe(canApprove);
        expect(Boolean(screen.queryByRole("button", { name: "Save finance" }))).toBe(canSaveFinance);
    });

    test("submits a request without sending blank optional fields", async () => {
        const fetchSpy = vi.spyOn(global, "fetch").mockImplementation((url, options = {}) => {
            if (url.endsWith("/event-requests") || url.endsWith("/event-requests/")) {
                return Promise.resolve(apiResponse());
            }
            throw new Error(`Unexpected API request: ${url} ${options.method || "GET"}`);
        });

        render(<EventOperations canManageRequests />);
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

        render(<EventOperations canManageRequests={false} />);

        expect(screen.queryByRole("button", { name: /new event request/i })).not.toBeInTheDocument();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
