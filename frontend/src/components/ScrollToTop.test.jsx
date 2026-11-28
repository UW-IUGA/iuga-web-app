/*
 * Purpose: Verify that Back returns the visitor to the spot they left, even when the page they return to loads its content after mounting.
 * Authentication/Authorization Requirements: None.
 * Expected Request Information: Renders ScrollToTop inside a memory router with two routes.
 * Expected Response Information: Asserts the scroll position after Back, with page height and scroll limits simulated.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import ScrollToTop from "./ScrollToTop";

let scrollTop = 0;
let longestPage = Infinity;

beforeEach(() => {
    scrollTop = 0;
    longestPage = Infinity;
    vi.spyOn(window, "scrollTo").mockImplementation((x, y) => {
        const target = typeof x === "object" ? x.top : y;
        scrollTop = Math.max(0, Math.min(target ?? 0, longestPage));
        window.dispatchEvent(new Event("scroll"));
    });
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollTop });
});

afterEach(() => {
    vi.restoreAllMocks();
});

function Harness() {
    const navigate = useNavigate();
    return (
        <>
            <ScrollToTop />
            <button type="button" onClick={() => navigate("/b")}>Go to b</button>
            <button type="button" onClick={() => navigate(-1)}>Back</button>
            <Routes>
                <Route path="/a" element={<p>Page a</p>} />
                <Route path="/b" element={<p>Page b</p>} />
            </Routes>
        </>
    );
}

const renderAtA = () => render(
    <MemoryRouter initialEntries={["/a"]}>
        <Harness />
    </MemoryRouter>
);

describe("returning to a page", () => {
    test("restores the spot once the page has grown to hold it, even when it was short at the moment of Back", async () => {
        longestPage = 3000;
        renderAtA();
        act(() => window.scrollTo(0, 1500));
        fireEvent.click(screen.getByRole("button", { name: "Go to b" }));

        longestPage = 800;
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        setTimeout(() => { longestPage = 3000; }, 100);

        await waitFor(() => expect(window.scrollY).toBe(1500), { timeout: 1000 });
    });

    test("leaves the page where the visitor scrolls while it is still waiting to restore", async () => {
        longestPage = 3000;
        renderAtA();
        act(() => window.scrollTo(0, 1500));
        fireEvent.click(screen.getByRole("button", { name: "Go to b" }));

        longestPage = 800;
        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        window.dispatchEvent(new Event("wheel"));
        setTimeout(() => { longestPage = 3000; }, 100);

        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(window.scrollY).toBe(800);
    });
});
