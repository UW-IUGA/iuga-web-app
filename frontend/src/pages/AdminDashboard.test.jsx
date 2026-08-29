import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import AdminDashboard from "./AdminDashboard";
import { adminRequest } from "../utils/adminApi";
import { useAuthContext } from "../context/AuthContext";

vi.mock("../components/AdminRoute", () => ({ default: ({ children }) => children }));
vi.mock("../context/AuthContext", () => ({ useAuthContext: vi.fn() }));
vi.mock("../utils/adminApi", () => ({ adminRequest: vi.fn() }));

describe("AdminDashboard", () => {
    test("renders role-scoped queues and budget context", async () => {
        useAuthContext.mockReturnValue({ can: vi.fn((permission) => ["events.leadership.approve", "events.finance.manage"].includes(permission)) });
        adminRequest.mockImplementation((path) => path === "dashboard"
            ? Promise.resolve({
                queues: [{ key: "PVP_REVIEW", label: "P/VP review", requests: [{ _id: "request-1", title: "Autumn workshop" }] }, { key: "FINANCE_REVIEW", label: "Finance review", requests: [] }],
                ownRequests: [{ _id: "own-1", title: "Panel night", status: "FINANCE_REVIEW", nextResponsibleRole: "Director of Finance" }],
                stalled: [{ _id: "stalled-1", title: "Autumn workshop", updatedAt: "2026-08-01T00:00:00.000Z", nextResponsibleRole: "President / Vice President" }],
                activeCycle: { cycleName: "2026–2027", budgetTotalCents: 100000, budgetCommittedCents: 25000 },
            })
            : Promise.resolve({ notifications: [] }));

        render(<AdminDashboard />);

        expect(await screen.findByRole("heading", { name: "P/VP review" })).toBeInTheDocument();
        expect(screen.getAllByText("Autumn workshop")).toHaveLength(2);
        expect(screen.getByText("$750.00")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Your responsibilities" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "President / Vice President" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Director of Finance" })).toBeInTheDocument();
        expect(screen.getByText("Next: Director of Finance")).toBeInTheDocument();
        expect(screen.getByText("Responsible role: President / Vice President")).toBeInTheDocument();
    });

    test("does not show role-specific responsibilities to a board member without workflow permissions", async () => {
        useAuthContext.mockReturnValue({ can: vi.fn(() => false) });
        adminRequest.mockImplementation((path) => path === "dashboard"
            ? Promise.resolve({ queues: [], ownRequests: [], stalled: [], activeCycle: null })
            : Promise.resolve({ notifications: [] }));

        render(<AdminDashboard />);

        expect(await screen.findByRole("heading", { name: "Board dashboard" })).toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Your responsibilities" })).not.toBeInTheDocument();
    });
});
