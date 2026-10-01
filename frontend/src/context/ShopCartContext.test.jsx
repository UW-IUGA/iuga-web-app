/*
 * Purpose: Permanent cart checkout and paid-return behavior regressions.
 * Authentication/Authorization Requirements: Auth and API boundaries are mocked; no live payments.
 * Expected Request Information: Shopper interactions and authenticated checkout responses.
 * Expected Response Information: Visible return notices and cart contents across reloads.
 */
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ShopCartProvider } from "./ShopCartContext";
import ShopPage from "../pages/Shop";

const auth = vi.hoisted(() => ({ isAuthenticated: true, signIn: vi.fn() }));
vi.mock("./AuthContext", () => ({ useAuthContext: () => auth }));

const bag = { sku: "info-tote-bag", size: "One Size", quantity: 1 };
const hoodie = { sku: "info-hoodie", size: "L", quantity: 1 };
const catalog = {
    catalogId: "fall-2026",
    catalogVersion: "fall-2026-v1",
    saleState: "open",
    currency: "usd",
    items: [
        { sku: bag.sku, name: "INFO Tote Bag", sizes: [bag.size], unitPriceCents: 2000 },
        { sku: hoodie.sku, name: "Hoodie", sizes: ["S", "M", "L"], unitPriceCents: 4500 },
    ],
};
const sessionId = "cs_test_paid_return";
const returnUrl = `/shop?checkout=complete&session_id=${sessionId}`;
const handoffKey = `iuga_shop_checkout_${sessionId}`;

function response(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockApi({ verify = () => response({ paymentStatus: "paid" }), checkout } = {}) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
        if (url === "/api/v1/shop/catalog") return response({ status: "success", catalog });
        if (url.startsWith("/api/v1/shop/checkout/")) return verify(url);
        if (url === "/api/v1/shop/checkout" && options.method === "POST" && checkout) return checkout(options);
        throw new Error(`Unexpected API request: ${options.method || "GET"} ${url}`);
    });
}

function storeCart(cart, purchased) {
    sessionStorage.setItem("iuga_shop_cart", JSON.stringify(cart));
    sessionStorage.setItem("iuga_shop_catalog", JSON.stringify({ timestamp: Date.now(), catalog }));
    if (purchased) sessionStorage.setItem(handoffKey, JSON.stringify(purchased));
}

function renderShop(url = "/shop") {
    return render(
        <StrictMode>
            <MemoryRouter initialEntries={[url]}>
                <div id="shop-cart-slot" />
                <ShopCartProvider><ShopPage /></ShopCartProvider>
            </MemoryRouter>
        </StrictMode>
    );
}

function bagQuantity() {
    return screen.getByRole("textbox", { name: "INFO Tote Bag quantity. Type a number from 1 to 100." });
}

async function openCart() {
    fireEvent.click(await screen.findByRole("button", { name: /Cart, \d+ items?/ }));
    return screen.getByRole("button", { name: /^(Checkout|Sign in to checkout)$/ });
}

function mockRedirect() {
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    return assign;
}

beforeEach(() => {
    auth.isAuthenticated = true;
    auth.signIn.mockReset();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
});

describe("starting checkout from the cart", () => {
    const stripeUrl = "https://checkout.stripe.com/c/pay/cs_test_paid_return";
    const checkoutStarted = () => response({ url: stripeUrl, sessionId });

    test("one successful sign-in starts checkout and its saved snapshot preserves additions made before returning", async () => {
        auth.isAuthenticated = false;
        let resolveSignIn;
        auth.signIn.mockImplementation(() => new Promise((resolve) => { resolveSignIn = resolve; }));
        storeCart([bag]);
        const checkout = vi.fn(checkoutStarted);
        mockApi({ checkout });
        const assign = mockRedirect();
        const firstVisit = renderShop();
        const button = await openCart();

        fireEvent.click(button);
        expect(screen.getByRole("button", { name: "Processing checkout..." })).toBeDisabled();
        expect(checkout).not.toHaveBeenCalled();
        await act(async () => resolveSignIn({ id: "test-buyer" }));

        expect(auth.signIn).toHaveBeenCalledTimes(1);
        expect(checkout).toHaveBeenCalledTimes(1);
        expect(JSON.parse(checkout.mock.calls[0][0].body)).toEqual({
            catalogVersion: "fall-2026-v1",
            items: [{ sku: "info-tote-bag", size: "One Size", quantity: 1 }],
        });
        expect(assign).toHaveBeenCalledWith(stripeUrl);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        firstVisit.unmount();

        auth.isAuthenticated = true;
        storeCart([{ ...bag, quantity: 3 }, hoodie]);
        renderShop(returnUrl);
        await waitFor(() => expect(bagQuantity()).toHaveValue("2"));
        expect(screen.getByRole("textbox", { name: "Hoodie L quantity. Type a number from 1 to 100." })).toHaveValue("1");
        expect(screen.getByRole("button", { name: "Cart, 3 items" })).toBeInTheDocument();
    });

    test("canceling sign-in unlocks checkout, keeps the bag open, and allows a successful retry", async () => {
        auth.isAuthenticated = false;
        auth.signIn.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "test-buyer" });
        storeCart([bag]);
        const checkout = vi.fn(checkoutStarted);
        mockApi({ checkout });
        const assign = mockRedirect();
        renderShop();
        fireEvent.click(await openCart());

        await waitFor(() => expect(screen.getByRole("button", { name: "Sign in to checkout" })).toBeEnabled());
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(checkout).not.toHaveBeenCalled();
        expect(assign).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Cart, 1 item" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Sign in to checkout" }));
        await waitFor(() => expect(assign).toHaveBeenCalledWith(stripeUrl));
        expect(checkout).toHaveBeenCalledTimes(1);
        expect(auth.signIn).toHaveBeenCalledTimes(2);
    });

    test("a 401 reauthenticates once and retries the same checkout before leaving for Stripe", async () => {
        auth.signIn.mockResolvedValue({ id: "test-buyer" });
        storeCart([bag]);
        const checkout = vi.fn().mockImplementationOnce(() => response({}, 401)).mockImplementationOnce(checkoutStarted);
        mockApi({ checkout });
        const assign = mockRedirect();
        renderShop();
        fireEvent.click(await openCart());

        await waitFor(() => expect(assign).toHaveBeenCalledWith(stripeUrl));
        expect(auth.signIn).toHaveBeenCalledTimes(1);
        expect(checkout).toHaveBeenCalledTimes(2);
        expect(checkout.mock.calls[1][0].body).toBe(checkout.mock.calls[0][0].body);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("a second 401 ends recovery instead of looping and keeps the bag usable", async () => {
        auth.signIn.mockResolvedValue({ id: "test-buyer" });
        storeCart([bag]);
        const checkout = vi.fn(() => response({}, 401));
        mockApi({ checkout });
        const assign = mockRedirect();
        renderShop();
        fireEvent.click(await openCart());

        expect(await screen.findByText(/your session expired/i)).toBeInTheDocument();
        expect(auth.signIn).toHaveBeenCalledTimes(1);
        expect(checkout).toHaveBeenCalledTimes(2);
        expect(assign).not.toHaveBeenCalled();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Checkout" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Cart, 1 item" })).toBeInTheDocument();
    });

    test("a failed checkout leaves its notice in the open bag and can be retried", async () => {
        storeCart([bag]);
        const checkout = vi.fn().mockImplementationOnce(() => response({}, 503)).mockImplementationOnce(checkoutStarted);
        mockApi({ checkout });
        const assign = mockRedirect();
        renderShop();
        fireEvent.click(await openCart());

        expect(await screen.findByText(/unable to start checkout/i)).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Checkout" })).toBeEnabled();
        expect(assign).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "Checkout" }));

        await waitFor(() => expect(assign).toHaveBeenCalledWith(stripeUrl));
        expect(checkout).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("a stale-catalog 409 forces a fresh catalog even just after loading and requires another confirmation", async () => {
        storeCart([bag]);
        const checkout = vi.fn(() => response({}, 409));
        const api = mockApi({ checkout });
        const assign = mockRedirect();
        renderShop();
        await act(async () => {});
        const initialCatalogRequests = api.mock.calls.filter(([url]) => url === "/api/v1/shop/catalog").length;
        api.mockImplementation(async (url, options = {}) => {
            if (url === "/api/v1/shop/catalog") return response({ status: "success", catalog: {
                ...catalog,
                catalogVersion: "fall-2026-v2",
                saleState: "closed",
                closesAt: "2026-10-01T00:00:00.000Z",
            } });
            if (url === "/api/v1/shop/checkout" && options.method === "POST") return checkout(options);
            throw new Error(`Unexpected API request: ${url}`);
        });
        fireEvent.click(await openCart());

        expect(await screen.findByText(/catalog has updated or the sale status changed/i)).toBeInTheDocument();
        expect(api.mock.calls.filter(([url]) => url === "/api/v1/shop/catalog").length).toBe(initialCatalogRequests + 1);
        expect(screen.getByRole("button", { name: "Checkout" })).toBeDisabled();
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(checkout).toHaveBeenCalledTimes(1);
        expect(assign).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Cart, 1 item" })).toBeInTheDocument();
    });

});
