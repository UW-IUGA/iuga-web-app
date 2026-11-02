/*
 * Purpose: Verify the officer admin bar: a link to each admin page, the open page marked, moving between
 *          pages, and the permission that hides a section's pages.
 * Authentication/Authorization Requirements: Auth is mocked; permissions are set per test.
 * Expected Request Information: Clicks on the bar, inside a memory router.
 * Expected Response Information: Links, the marked page, and the page shown after a choice.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminBar from "./AdminBar";

const auth = vi.hoisted(() => {
    const auth = { isAuthenticated: true, user: { uFirstName: "Olive" }, permissions: [], signOut: vi.fn() };
    auth.can = (permission) => auth.permissions.includes(permission);
    return auth;
});
vi.mock("../context/AuthContext", () => ({ useAuthContext: () => auth }));

beforeEach(() => {
    auth.permissions = ["shop.purchases.review"];
    auth.signOut.mockClear();
});

// The bar stays on screen across pages; each admin page is a heading so a choice can be seen.
function renderBar(path = "/admin/shop/orders") {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <AdminBar />
            <Routes>
                <Route path="/admin/shop/orders" element={<h1>Orders page</h1>} />
                <Route path="/admin/shop/pickup" element={<h1>Pickup page</h1>} />
            </Routes>
        </MemoryRouter>
    );
}

const pages = () => screen.getByRole("navigation", { name: "Admin pages" });

describe("admin bar", () => {
    test("shows the brand as a link to the admin home and the officer's sign-out and back-to-site links", () => {
        renderBar();

        expect(screen.getByRole("link", { name: "IUGA Admin" })).toHaveAttribute("href", "/admin");
        expect(screen.getByRole("link", { name: "Back to site" })).toHaveAttribute("href", "/");
        expect(screen.getByText("Olive")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        expect(auth.signOut).toHaveBeenCalledOnce();
    });

    test("links straight to Orders and Pickup, with no menu to open first", () => {
        renderBar();

        expect(within(pages()).getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/admin/shop/orders");
        expect(within(pages()).getByRole("link", { name: "Pickup" })).toHaveAttribute("href", "/admin/shop/pickup");
        expect(within(pages()).queryByRole("button")).not.toBeInTheDocument();
    });

    test("marks only the open page as current", () => {
        renderBar("/admin/shop/pickup");

        expect(within(pages()).getByRole("link", { name: "Pickup" })).toHaveAttribute("aria-current", "page");
        expect(within(pages()).getByRole("link", { name: "Orders" })).not.toHaveAttribute("aria-current");
    });

    test("marks the open page even when its address ends in a slash", () => {
        renderBar("/admin/shop/orders/");

        expect(within(pages()).getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
    });

    test("choosing a page goes to it and moves the mark", () => {
        renderBar("/admin/shop/orders");
        fireEvent.click(within(pages()).getByRole("link", { name: "Pickup" }));

        expect(screen.getByRole("heading", { name: "Pickup page" })).toBeInTheDocument();
        expect(within(pages()).getByRole("link", { name: "Pickup" })).toHaveAttribute("aria-current", "page");
        expect(within(pages()).getByRole("link", { name: "Orders" })).not.toHaveAttribute("aria-current");
    });

    test("hides the Shop pages from an officer who lacks its permission, and keeps the rest of the bar", () => {
        auth.permissions = [];
        renderBar();

        expect(screen.queryByRole("link", { name: "Orders" })).not.toBeInTheDocument();
        expect(screen.queryByRole("link", { name: "Pickup" })).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "IUGA Admin" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    });
});
