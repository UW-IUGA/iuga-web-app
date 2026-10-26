/*
 * Purpose: Verify the shared site navigation and its temporary menus.
 * Authentication/Authorization Requirements: Uses a mocked signed-in session.
 * Expected Request Information: Renders the navbar inside a memory router.
 * Expected Response Information: Asserts links, menu controls, and dismissal behavior.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";

const auth = vi.hoisted(() => {
    const auth = { isAuthenticated: true, user: { uFirstName: "Yonie", uType: "Member" }, permissions: [] };
    auth.can = (permission) => auth.permissions.includes(permission);
    return auth;
});
vi.mock("../context/AuthContext", () => ({ useAuthContext: () => auth }));

beforeEach(() => {
    auth.permissions = [];
});

const renderNavigation = (path = "/") => render(
    <MemoryRouter initialEntries={[path]}>
        <Navbar signIn={vi.fn()} signOut={vi.fn()} />
    </MemoryRouter>
);

// Opens a navbar dropdown and returns the panel its toggle controls.
const openMenu = (name) => {
    const toggle = screen.getByRole("button", { name });
    fireEvent.click(toggle);
    return document.getElementById(toggle.getAttribute("aria-controls"));
};

describe("global navigation", () => {
    test("places primary destinations in the requested order with About as a plain link", () => {
        renderNavigation();
        const nav = screen.getByRole("navigation", { name: "Primary navigation" });
        const links = [...nav.querySelectorAll("a")].map((link) => link.textContent || link.querySelector("img")?.alt);
        expect(links.slice(0, 6)).toEqual(["IUGA home", "Events", "Resources", "Student Voice", "Shop", "About"]);
        expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/about");
        expect(screen.getByRole("link", { name: "Get Involved" })).toHaveAttribute("href", "/get-involved");
        expect(screen.queryByRole("button", { name: /button styles/i })).not.toBeInTheDocument();
        expect(nav.querySelector("#shop-cart-slot")).toBeInTheDocument();
    });

    test("shows the student's name and a text sign-out action without role or avatar", () => {
        const signOut = vi.fn();
        render(<MemoryRouter><Navbar signIn={vi.fn()} signOut={signOut} /></MemoryRouter>);
        fireEvent.click(screen.getByRole("button", { name: "Yonie account" }));
        expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
        expect(screen.queryByText("Member")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        expect(signOut).toHaveBeenCalledOnce();
    });

    test("shows an Admin link to officers holding an admin permission, and hides it otherwise", () => {
        const { unmount } = renderNavigation();
        expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
        unmount();

        auth.permissions = ["events.finance.manage"];
        const { unmount: unmountOther } = renderNavigation();
        expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
        unmountOther();

        auth.permissions = ["shop.purchases.review"];
        renderNavigation();
        expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
        expect(screen.queryByRole("button", { name: "Admin" })).not.toBeInTheDocument();
    });

    test("keeps the Admin link in the mobile menu list with the other primary links", () => {
        auth.permissions = ["shop.purchases.review"];
        renderNavigation();
        const menu = document.getElementById("nav-items");
        expect(within(menu).getByRole("link", { name: "Admin" })).toBeInTheDocument();
    });

    test("Escape closes an open account menu", () => {
        renderNavigation();
        openMenu("Yonie account");
        expect(screen.getByRole("button", { name: "Yonie account" })).toHaveAttribute("aria-expanded", "true");

        fireEvent.keyDown(screen.getByRole("button", { name: "Yonie account" }), { key: "Escape" });
        expect(screen.getByRole("button", { name: "Yonie account" })).toHaveAttribute("aria-expanded", "false");
    });

    test.each(["/admin", "/admin/shop/orders", "/admin/shop/pickup"])(
        "on %s, marks Admin as the current page and leaves the public Shop link unmarked",
        (path) => {
            auth.permissions = ["shop.purchases.review"];
            renderNavigation(path);
            expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("aria-current", "page");
            expect(screen.getByRole("link", { name: "Shop" })).not.toHaveAttribute("aria-current");
        }
    );

    test("marks the public Shop link as current on the checkout page", () => {
        renderNavigation("/shop/checkout/hold-1");
        expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute("aria-current", "page");
    });

    test("hamburger opens a temporary menu and a destination closes it", () => {
        renderNavigation();
        const toggle = screen.getByRole("button", { name: "Open menu" });
        fireEvent.click(toggle);
        expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
        fireEvent.click(screen.getByRole("link", { name: "Events" }));
        expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
    });
});
