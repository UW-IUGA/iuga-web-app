import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import AdminLayout from "./AdminLayout";

vi.mock("../context/AuthContext", () => ({
    useAuthContext: vi.fn(),
}));

describe("AdminLayout", () => {
    afterEach(() => vi.clearAllMocks());

    test("renders admin navigation and keeps the public shell out of the workspace", () => {
        useAuthContext.mockReturnValue({ can: vi.fn().mockReturnValue(true) });

        render(
            <MemoryRouter initialEntries={["/admin/event-requests"]}>
                <Routes>
                    <Route element={<AdminLayout />}>
                        <Route path="/admin/event-requests" element={<h1>Event request administration</h1>} />
                    </Route>
                </Routes>
            </MemoryRouter>,
        );

        expect(screen.getByRole("banner")).toHaveTextContent("Exec board workspace");
        expect(screen.getByRole("navigation", { name: "Admin navigation" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Event request administration" })).toBeInTheDocument();
        expect(screen.queryByText("IUGA home")).not.toBeInTheDocument();
    });
});
