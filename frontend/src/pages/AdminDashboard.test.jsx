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
        useAuthContext.mockReturnValue({ can: vi.fn() });
        adminRequest.mockImplementation((path) => path === "dashboard"
            ? Promise.resolve({
                queues: [{ key: "FINANCE_REVIEW", label: "Finance review", requests: [{ _id: "request-1", title: "Autumn workshop" }] }],
                ownRequests: [],
                stalled: [],
                activeCycle: { cycleName: "2026–2027", budgetTotalCents: 100000, budgetCommittedCents: 25000 },
            })
            : Promise.resolve({ notifications: [] }));

        render(<AdminDashboard />);

        expect(await screen.findByRole("heading", { name: "Finance review" })).toBeInTheDocument();
        expect(screen.getByText("Autumn workshop")).toBeInTheDocument();
        expect(screen.getByText("$750.00")).toBeInTheDocument();
    });
});
