/*
 * Purpose: Verify that shared navigation keeps the global shopping bag usable across routes.
 * Authentication/Authorization Requirements: Uses a mocked UW session; no real sign-in or payment.
 * Expected Request Information: Renders the real navbar and cart provider with catalog responses.
 * Expected Response Information: Students can open and edit their bag after navigating.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Navbar from "./Navbar";
import { ShopCartProvider } from "../context/ShopCartContext";

vi.mock("../context/AuthContext", () => ({
    useAuthContext: () => ({ isAuthenticated: true, user: { uFirstName: "Yonie" } }),
}));

const catalog = {
    saleState: "open",
    catalogVersion: "test-drop",
    items: [{ sku: "test-shirt", name: "Campus shirt", sizes: ["M"], unitPriceCents: 2500 }],
};

beforeEach(() => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem("iuga_shop_cart", JSON.stringify([
        { sku: "test-shirt", size: "M", quantity: 2 },
    ]));
    vi.stubGlobal("fetch", vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "success", catalog }),
    })));
});

afterEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
});

function renderNavigation(path = "/events", signOut = vi.fn()) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <Navbar signIn={vi.fn()} signOut={signOut} />
            <ShopCartProvider>
                <Routes>
                    <Route path="/" element={<h1>Home page</h1>} />
                    <Route path="/events" element={<h1>Events page</h1>} />
                    <Route path="/resources" element={<h1>Resources page</h1>} />
                    <Route path="/about" element={<h1>About page</h1>} />
                    <Route path="/shop" element={<h1>Shop page</h1>} />
                </Routes>
            </ShopCartProvider>
        </MemoryRouter>
    );
}

test.each(["/", "/events", "/resources", "/shop"])("the navbar opens the real bag on %s and keeps it usable after navigation", async (path) => {
    renderNavigation(path);
    fireEvent.click(await screen.findByRole("button", { name: "Cart, 2 items" }));
    const bag = screen.getByRole("dialog", { name: "Your bag (2)" });
    expect(await within(bag).findByText("Campus shirt")).toBeInTheDocument();
    expect(within(bag).getByText("Subtotal: $50.00")).toBeInTheDocument();
    fireEvent.click(within(bag).getByRole("button", { name: "Close bag" }));

    fireEvent.click(screen.getByRole("link", { name: "About" }));
    expect(screen.getByRole("heading", { name: "About page" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cart, 2 items" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Your bag (2)" })).getByRole("button", { name: "Increase Campus shirt M" }));
    expect(screen.getByRole("button", { name: "Cart, 3 items" })).toBeInTheDocument();
    expect(within(screen.getByRole("dialog", { name: "Your bag (3)" })).getByText("Subtotal: $75.00")).toBeInTheDocument();
});

test("mobile menu and account controls still work while the global bag survives route changes", async () => {
    const signOut = vi.fn();
    renderNavigation("/events", signOut);
    await screen.findByRole("button", { name: "Cart, 2 items" });

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Yonie account" }));
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Resources" }));
    expect(screen.getByRole("heading", { name: "Resources page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Yonie account" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cart, 2 items" }));
    expect(await within(screen.getByRole("dialog", { name: "Your bag (2)" })).findByText("Campus shirt")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Yonie account" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false");
});

test("an empty bag on a non-shop route takes the student to the shop without losing its trigger", async () => {
    window.sessionStorage.clear();
    renderNavigation("/about");
    fireEvent.click(await screen.findByRole("button", { name: "Shopping cart, empty" }));
    const bag = screen.getByRole("dialog", { name: "Your bag" });
    expect(within(bag).getByRole("heading", { name: "Your bag is empty." })).toBeInTheDocument();
    fireEvent.click(within(bag).getByRole("link", { name: "Continue shopping" }));
    expect(screen.getByRole("heading", { name: "Shop page" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Shopping cart, empty" }));
    expect(screen.getByRole("dialog", { name: "Your bag" })).toBeInTheDocument();
});
