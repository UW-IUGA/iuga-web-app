import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import AdminDashboard from "./AdminDashboard";
import { adminRequest } from "../utils/adminApi";
import { useAuthContext } from "../context/AuthContext";

vi.mock("../components/AdminRoute", () => ({ default: ({ children }) => children }));
vi.mock("../context/AuthContext", () => ({ useAuthContext: vi.fn() }));
vi.mock("../utils/adminApi", () => ({ adminRequest: vi.fn() }));

const renderDashboard = () => render(<MemoryRouter><AdminDashboard /></MemoryRouter>);

describe("AdminDashboard", () => {
    test("links queue, own, and stalled requests into the pipeline", async () => {
        useAuthContext.mockReturnValue({ can: vi.fn((permission) => ["events.leadership.approve", "events.finance.manage"].includes(permission)) });
        adminRequest.mockImplementation((path) => path === "dashboard"
            ? Promise.resolve({
                queues: [{ key: "PVP_REVIEW", label: "P/VP review", requests: [{ _id: "request-1", title: "Autumn workshop" }] }, { key: "FINANCE_REVIEW", label: "Finance review", requests: [] }],
                ownRequests: [{ _id: "own-1", title: "Panel night", status: "FINANCE_REVIEW", nextResponsibleRole: "Director of Finance" }],
                stalled: [{ _id: "stalled-1", title: "Autumn workshop", updatedAt: "2026-08-01T00:00:00.000Z", nextResponsibleRole: "President / Vice President" }],
                activeCycle: { cycleName: "2026–2027", budgetTotalCents: 100000, budgetCommittedCents: 25000 },
            })
            : Promise.resolve({ notifications: [] }));

        renderDashboard();

        expect(await screen.findByRole("heading", { name: "P/VP review" })).toBeInTheDocument();
        expect(screen.getByText("$750.00")).toBeInTheDocument();

        const queueLink = screen.getAllByRole("link", { name: "Autumn workshop" })[0];
        expect(queueLink).toHaveAttribute("href", "/admin/pipeline/request-1");
        expect(screen.getByRole("link", { name: /Panel night/ })).toHaveAttribute("href", "/admin/pipeline/own-1");
        expect(screen.getByText("Next: Director of Finance")).toBeInTheDocument();
        expect(screen.getByText("Responsible role: President / Vice President")).toBeInTheDocument();
    });

    test("drops the static responsibilities section", async () => {
        useAuthContext.mockReturnValue({ can: vi.fn(() => false) });
        adminRequest.mockImplementation((path) => path === "dashboard"
            ? Promise.resolve({ queues: [], ownRequests: [], stalled: [], activeCycle: null })
            : Promise.resolve({ notifications: [] }));

        renderDashboard();

        expect(await screen.findByRole("heading", { name: "Board dashboard" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Your responsibilities" })).not.toBeInTheDocument();
        expect(screen.getByText("You have no event requests.")).toBeInTheDocument();
    });
});
