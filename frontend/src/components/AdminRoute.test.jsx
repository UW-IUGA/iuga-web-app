import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useAuthContext } from "../context/AuthContext";
import AdminRoute from "./AdminRoute";

vi.mock("../context/AuthContext", () => ({
    useAuthContext: vi.fn(),
}));

describe("AdminRoute", () => {
    afterEach(() => vi.clearAllMocks());

    test("asks anonymous users to sign in", () => {
        useAuthContext.mockReturnValue({
            authLoading: false,
            isAuthenticated: false,
            can: vi.fn(),
            signIn: vi.fn(),
        });

        render(<AdminRoute requiredPermission="events.requests.view"><p>private content</p></AdminRoute>);

        expect(screen.getByRole("heading", { name: "Sign in to continue" })).toBeInTheDocument();
        expect(screen.queryByText("private content")).not.toBeInTheDocument();
    });

    test("blocks signed-in users without the required permission", () => {
        const can = vi.fn().mockReturnValue(false);
        useAuthContext.mockReturnValue({
            authLoading: false,
            isAuthenticated: true,
            can,
            signIn: vi.fn(),
        });

        render(<AdminRoute requiredPermission="events.requests.view"><p>private content</p></AdminRoute>);

        expect(screen.getByRole("heading", { name: "Access unavailable" })).toBeInTheDocument();
        expect(screen.queryByText("private content")).not.toBeInTheDocument();
        expect(can).toHaveBeenCalledWith("events.requests.view");
    });

    test("renders the protected content when authorized", () => {
        useAuthContext.mockReturnValue({
            authLoading: false,
            isAuthenticated: true,
            can: vi.fn().mockReturnValue(true),
            signIn: vi.fn(),
        });

        render(<AdminRoute requiredPermission="events.requests.view"><p>private content</p></AdminRoute>);

        expect(screen.getByText("private content")).toBeInTheDocument();
    });
});
