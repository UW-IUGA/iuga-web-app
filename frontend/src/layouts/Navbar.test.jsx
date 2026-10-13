/*
 * Purpose: Verify the shared site navigation and its temporary menus.
 * Authentication/Authorization Requirements: Uses a mocked signed-in session.
 * Expected Request Information: Renders the navbar inside a memory router.
 * Expected Response Information: Asserts links, menu controls, and dismissal behavior.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";

vi.mock("../context/AuthContext", () => ({
    useAuthContext: () => ({ isAuthenticated: true, user: { uFirstName: "Yonie", uType: "Member" } }),
}));

const renderNavigation = () => render(
    <MemoryRouter>
        <Navbar signIn={vi.fn()} signOut={vi.fn()} />
    </MemoryRouter>
);

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
        expect(screen.getByText("Signed in with UW NetID")).toBeInTheDocument();
        expect(screen.queryByText("Member")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
        expect(signOut).toHaveBeenCalledOnce();
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
