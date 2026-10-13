/*
 * Purpose: The maintenance banner: who sees it, the countdown to an announced time, and the paused notice.
 * Authentication/Authorization Requirements: None; the cart and the status request are mocked.
 * Expected Request Information: The student's cart and the shop status response.
 * Expected Response Information: The visible notice, or nothing.
 */
import { act, cleanup, render, screen } from "@testing-library/react";
import ShopMaintenanceBanner from "./ShopMaintenanceBanner";

const cartState = vi.hoisted(() => ({ cart: [] }));
vi.mock("../context/ShopCartContext", () => ({ useShopCart: () => cartState }));

const hoodie = { sku: "info-hoodie", size: "M", quantity: 1 };

function statusResponse(shop) {
    return { ok: true, status: 200, json: async () => ({ status: "success", shop }) };
}

async function renderBanner() {
    render(<ShopMaintenanceBanner />);
    // Let the status request settle.
    await act(async () => {});
}

beforeEach(() => {
    cartState.cart = [hoodie];
    vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

test("shows nothing and asks nothing when the cart is empty", async () => {
    cartState.cart = [];
    await renderBanner();

    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("shows nothing when no maintenance is planned and checkout is open", async () => {
    fetch.mockResolvedValue(statusResponse({ checkoutPaused: false, maintenanceAt: null }));
    await renderBanner();

    expect(fetch).toHaveBeenCalledWith("/api/v1/shop/status");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("counts down to an announced maintenance time for a student with items in the cart", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-13T22:30:00.000Z"));
    fetch.mockResolvedValue(statusResponse({ checkoutPaused: false, maintenanceAt: "2026-10-13T22:45:00.000Z" }));
    await renderBanner();

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/Shop maintenance at \d{1,2}:45\s?[AP]M\./);
    expect(banner).toHaveTextContent("Checkout closes then, so finish checking out before it starts.");
    expect(banner).toHaveTextContent("15:00 left");

    await act(async () => {
        vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("13:59 left");
});

test("switches to the paused notice when the maintenance time arrives", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-10-13T22:44:58.000Z"));
    fetch.mockResolvedValue(statusResponse({ checkoutPaused: false, maintenanceAt: "2026-10-13T22:45:00.000Z" }));
    await renderBanner();
    expect(screen.getByRole("status")).toHaveTextContent("0:02 left");

    await act(async () => {
        vi.advanceTimersByTime(3_000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Shop checkout is paused for maintenance.");
    expect(screen.getByRole("status")).toHaveTextContent("Your cart is saved.");
});

test("shows the paused notice while an officer has paused checkout", async () => {
    fetch.mockResolvedValue(statusResponse({ checkoutPaused: true, maintenanceAt: null }));
    await renderBanner();

    expect(screen.getByRole("status")).toHaveTextContent("Shop checkout is paused for maintenance.");
});

test("stays quiet when the status cannot be read", async () => {
    fetch.mockRejectedValue(new Error("offline"));
    await renderBanner();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
