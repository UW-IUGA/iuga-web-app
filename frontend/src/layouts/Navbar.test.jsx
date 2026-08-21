import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import Navbar from "./Navbar";
import { useAuthContext } from "../context/AuthContext";

jest.mock("../context/AuthContext", () => ({
    useAuthContext: jest.fn(),
}));

beforeEach(() => {
    // CRA's jest config sets resetMocks: true, so re-apply the stub each test.
    useAuthContext.mockReturnValue({ isAuthenticated: false, user: {} });
});

describe("Navbar", () => {
    const renderNavbar = () =>
        render(
            <MemoryRouter initialEntries={["/"]}>
                <Navbar signIn={jest.fn()} signOut={jest.fn()} />
            </MemoryRouter>
        );

    test("Get Involved link resolves to the /get-involved route, not a hash anchor", () => {
        renderNavbar();
        const link = screen.getByRole("link", { name: "Get Involved" });
        expect(link).toHaveAttribute("href", "/get-involved");
    });

    test("uses an accessible primary-navigation landmark", () => {
        renderNavbar();
        expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    });

    test("sidebar navigation keeps About Us before the inert Shop item", () => {
        renderNavbar();
        const links = screen.getAllByRole("link");
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
            "/",
            "/events",
            "/resources",
            "/student-voice",
            "/about",
            "/get-involved",
        ]);

        const nav = screen.getByRole("navigation");
        const navText = nav.textContent;
        expect(navText.indexOf("Events")).toBeLessThan(navText.indexOf("Resources"));
        expect(navText.indexOf("Resources")).toBeLessThan(navText.indexOf("Student Voice"));
        expect(navText.indexOf("Student Voice")).toBeLessThan(navText.indexOf("About Us"));
        expect(navText.indexOf("About Us")).toBeLessThan(navText.indexOf("Shop"));
        expect(navText.indexOf("Shop")).toBeLessThan(navText.indexOf("Get Involved"));
    });

    test("shows a compact desktop login alongside the mobile NetID action", () => {
        renderNavbar();
        expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "UW NetID Login" })).toBeInTheDocument();
    });

    test("shows a welcome account chip for authenticated users", () => {
        useAuthContext.mockReturnValue({
            isAuthenticated: true,
            user: { uFirstName: "Abe", uType: "Student" },
        });
        renderNavbar();

        expect(screen.getByText("Welcome back, Abe")).toBeInTheDocument();
        expect(screen.getByText("Student")).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: "Logout" })).toHaveLength(2);
    });
});
