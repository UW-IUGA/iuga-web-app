import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import AdminRepository from "./AdminRepository";

vi.mock("../components/AdminRoute", () => ({ default: ({ children }) => children }));
vi.mock("../context/AuthContext", () => ({ useAuthContext: () => ({ signIn: vi.fn() }) }));

const publishedEvent = { eId: "event-1", eName: "Spring Formal", eStartDate: "2026-04-10T23:00:00.000Z", eLocation: "HUB Ballroom", eOrganizers: "Social Committee" };
const adminRecord = {
    event: publishedEvent,
    eventRequest: { eventName: "Spring Formal", requestingGroup: "Social Committee", fundingRequestedCents: 50000, finance: { allocatedCents: 45000, notes: "Approved with a trim." }, purchases: [] },
};

describe("AdminRepository", () => {
    afterEach(() => vi.restoreAllMocks());

    test("lists published events and opens the full record on click", async () => {
        vi.spyOn(global, "fetch").mockImplementation((url) => {
            if (url.endsWith("/api/v1/events/")) return Promise.resolve({ ok: true, headers: { get: () => "application/json" }, json: async () => [publishedEvent] });
            if (url.endsWith("/api/v1/events/admin/event-1")) return Promise.resolve({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => adminRecord });
            throw new Error(`Unexpected request: ${url}`);
        });

        render(<AdminRepository />);

        fireEvent.click(await screen.findByRole("button", { name: /spring formal/i }));

        expect(await screen.findByRole("heading", { name: "Spring Formal", level: 2 })).toBeInTheDocument();
        expect(screen.getByText("$500.00")).toBeInTheDocument();
        expect(screen.getByText("$450.00")).toBeInTheDocument();
        expect(screen.getByText("Approved with a trim.")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Close record" }));
        await waitFor(() => expect(screen.queryByRole("heading", { name: "Spring Formal", level: 2 })).not.toBeInTheDocument());
    });

    test("surfaces a re-authentication prompt when the session expired", async () => {
        vi.spyOn(global, "fetch").mockImplementation((url) => {
            if (url.endsWith("/api/v1/events/")) return Promise.resolve({ ok: true, headers: { get: () => "application/json" }, json: async () => [publishedEvent] });
            if (url.endsWith("/api/v1/events/admin/event-1")) return Promise.resolve({ ok: false, status: 401, headers: { get: () => "application/json" }, json: async () => ({}) });
            throw new Error(`Unexpected request: ${url}`);
        });

        render(<AdminRepository />);
        fireEvent.click(await screen.findByRole("button", { name: /spring formal/i }));

        expect(await screen.findByRole("button", { name: "Sign in again" })).toBeInTheDocument();
    });
});
