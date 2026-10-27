/*
 * Purpose: The site chrome around each route: public pages keep the site navbar and footer, and the
 *          officer admin pages replace them with their own admin bar. Admin pages live under /admin
 *          and stay in their own light palette when the site is dark.
 * Authentication/Authorization Requirements: Auth, pages, and site chrome are stubbed; nothing is fetched.
 * Expected Request Information: A starting route.
 * Expected Response Information: Which chrome is rendered.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

vi.mock("./context/AuthContext", () => ({ useAuthContext: () => ({ signIn: vi.fn(), signOut: vi.fn() }) }));
vi.mock("./layouts/Navbar", () => ({ default: () => <nav aria-label="Site navigation" /> }));
vi.mock("./layouts/Footer", () => ({ default: () => <footer>Site footer</footer> }));
vi.mock("./components/ShopMaintenanceBanner", () => ({ default: () => <p>Shop notice</p> }));
vi.mock("./context/ShopCartContext", () => ({ ShopCartProvider: ({ children }) => children }));
vi.mock("./pages/Shop", () => ({ default: () => <h1>Shop</h1> }));
vi.mock("./pages/ShopOrders", () => ({ default: () => <h1>Orders</h1> }));
vi.mock("./pages/ShopPickup", () => ({ default: () => <h1>Pickup</h1> }));

function renderAt(path) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <App />
        </MemoryRouter>
    );
}

afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
});

it("keeps the site navbar, shop notice, and footer on public pages", () => {
    renderAt("/shop");

    expect(screen.getByRole("heading", { name: "Shop" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Site navigation" })).toBeInTheDocument();
    expect(screen.getByText("Shop notice")).toBeInTheDocument();
    expect(screen.getByText("Site footer")).toBeInTheDocument();
});

it("shows the admin Orders page without the site navbar, shop notice, or footer", () => {
    renderAt("/admin/shop/orders");

    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Site navigation" })).not.toBeInTheDocument();
    expect(screen.queryByText("Shop notice")).not.toBeInTheDocument();
    expect(screen.queryByText("Site footer")).not.toBeInTheDocument();
});

it("shows the admin Pickup page without the site navbar, shop notice, or footer", () => {
    renderAt("/admin/shop/pickup");

    expect(screen.getByRole("heading", { name: "Pickup" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Site navigation" })).not.toBeInTheDocument();
    expect(screen.queryByText("Shop notice")).not.toBeInTheDocument();
    expect(screen.queryByText("Site footer")).not.toBeInTheDocument();
});

it("opens the admin area on the Orders page, the first page of the first section", () => {
    renderAt("/admin");

    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Site navigation" })).not.toBeInTheDocument();
});

it("sends an unknown admin address to the admin home instead of an empty page", () => {
    renderAt("/admin/shop/unknown");

    expect(screen.getByRole("heading", { name: "Orders" })).toBeInTheDocument();
});

it("no longer serves the officer pages at their old /shop paths", () => {
    renderAt("/shop/orders");

    expect(screen.queryByRole("heading", { name: "Orders" })).not.toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Site navigation" })).toBeInTheDocument();
});

it("lets public pages follow the site's dark theme", () => {
    document.documentElement.dataset.theme = "dark";
    renderAt("/shop");

    expect(screen.getByRole("heading", { name: "Shop" }).closest("[data-theme]")).toBe(document.documentElement);
});

it("keeps the admin pages light when the site is dark", () => {
    document.documentElement.dataset.theme = "dark";
    renderAt("/admin/shop/orders");

    expect(screen.getByRole("heading", { name: "Orders" }).closest("[data-theme]").dataset.theme).toBe("light");
});
