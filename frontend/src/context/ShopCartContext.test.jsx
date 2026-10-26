/*
 * Purpose: Permanent cart checkout and paid-return behavior regressions.
 * Authentication/Authorization Requirements: Auth and API boundaries are mocked; no live payments.
 * Expected Request Information: Shopper interactions and authenticated checkout responses.
 * Expected Response Information: Visible return notices and cart contents across reloads.
 */
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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
        { sku: bag.sku, name: "INFO Tote Bag", sizes: [bag.size], unitPriceCents: 2000, perStudentLimit: 5 },
        { sku: hoodie.sku, name: "Hoodie", sizes: ["S", "M", "L"], unitPriceCents: 4500, perStudentLimit: 1 },
    ],
};
const sessionId = "cs_test_paid_return";
const returnUrl = `/shop?checkout=complete&session_id=${sessionId}`;
const handoffKey = `iuga_shop_checkout_${sessionId}`;
let currentPath = "/shop";

function LocationProbe() {
    currentPath = useLocation().pathname;
    return null;
}

function response(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockApi({ verify = () => response({ paymentStatus: "paid" }), checkout } = {}) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
        if (url === "/api/v1/shop/catalog") return response({ status: "success", catalog });
        if (url.startsWith("/api/v1/shop/checkout/")) return verify(url);
        if (url === "/api/v1/shop/holds" && options.method === "POST" && checkout) return checkout(options);
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
                <LocationProbe />
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

function currentPathname() {
    return currentPath;
}

beforeEach(() => {
    auth.isAuthenticated = true;
    auth.signIn.mockReset();
    currentPath = "/shop";
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    sessionStorage.clear();
});

describe("starting checkout from the cart", () => {
    const holdId = "64b000000000000000000001";
    const checkoutPath = `/shop/checkout/${holdId}`;
    const checkoutStarted = () => response({ hold: { id: holdId, status: "active" } });

    test("one successful sign-in starts a hold, keeps the bag, and opens the checkout page", async () => {
        auth.isAuthenticated = false;
        let resolveSignIn;
        auth.signIn.mockImplementation(() => new Promise((resolve) => { resolveSignIn = resolve; }));
        storeCart([bag]);
        const checkout = vi.fn(checkoutStarted);
        mockApi({ checkout });
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
        expect(currentPathname()).toBe(checkoutPath);
        expect(screen.queryByRole("region", { name: /Your cart/ })).not.toBeInTheDocument();
        firstVisit.unmount();

        // The bag is kept until a purchase is confirmed, so the checkout page opens with the same cart.
        renderShop(checkoutPath);
        expect(await screen.findByRole("button", { name: "Cart, 1 item" })).toBeInTheDocument();
    });

    test("canceling sign-in unlocks checkout, keeps the bag open, and allows a successful retry", async () => {
        auth.isAuthenticated = false;
        auth.signIn.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "test-buyer" });
        storeCart([bag]);
        const checkout = vi.fn(checkoutStarted);
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        await waitFor(() => expect(screen.getByRole("button", { name: "Sign in to checkout" })).toBeEnabled());
        expect(screen.getByRole("region", { name: /Your cart/ })).toBeInTheDocument();
        expect(checkout).not.toHaveBeenCalled();
        expect(currentPathname()).toBe("/shop");
        expect(screen.getByRole("button", { name: "Cart, 1 item" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Sign in to checkout" }));
        await waitFor(() => expect(currentPathname()).toBe(checkoutPath));
        expect(checkout).toHaveBeenCalledTimes(1);
        expect(auth.signIn).toHaveBeenCalledTimes(2);
    });

    test("a 401 reauthenticates once and retries the same checkout before leaving for Stripe", async () => {
        auth.signIn.mockResolvedValue({ id: "test-buyer" });
        storeCart([bag]);
        const checkout = vi.fn().mockImplementationOnce(() => response({}, 401)).mockImplementationOnce(checkoutStarted);
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        await waitFor(() => expect(currentPathname()).toBe(checkoutPath));
        expect(auth.signIn).toHaveBeenCalledTimes(1);
        expect(checkout).toHaveBeenCalledTimes(2);
        expect(checkout.mock.calls[1][0].body).toBe(checkout.mock.calls[0][0].body);
        expect(screen.queryByRole("region", { name: /Your cart/ })).not.toBeInTheDocument();
    });

    test("a second 401 ends recovery instead of looping and keeps the bag usable", async () => {
        auth.signIn.mockResolvedValue({ id: "test-buyer" });
        storeCart([bag]);
        const checkout = vi.fn(() => response({}, 401));
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        expect(await screen.findByText(/your session expired/i)).toBeInTheDocument();
        expect(auth.signIn).toHaveBeenCalledTimes(1);
        expect(checkout).toHaveBeenCalledTimes(2);
        expect(currentPathname()).toBe("/shop");
        expect(screen.getByRole("region", { name: /Your cart/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Checkout" })).toBeEnabled();
        expect(screen.getByRole("button", { name: "Cart, 1 item" })).toBeInTheDocument();
    });

    test("a failed checkout leaves its notice in the open bag and can be retried", async () => {
        storeCart([bag]);
        const checkout = vi.fn().mockImplementationOnce(() => response({}, 503)).mockImplementationOnce(checkoutStarted);
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
        expect(screen.getByRole("region", { name: /Your cart/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Checkout" })).toBeEnabled();
        expect(currentPathname()).toBe("/shop");
        fireEvent.click(screen.getByRole("button", { name: "Checkout" }));

        await waitFor(() => expect(currentPathname()).toBe(checkoutPath));
        expect(checkout).toHaveBeenCalledTimes(2);
        expect(screen.queryByRole("region", { name: /Your cart/ })).not.toBeInTheDocument();
    });

    test("a 503 from checkout shows the server's message and keeps the bag open without redirecting", async () => {
        storeCart([bag]);
        const checkout = vi.fn(() => response({ status: "error", message: "Checkout is paused for maintenance." }, 503));
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        expect(await screen.findByText("Checkout is paused for maintenance.")).toBeInTheDocument();
        expect(screen.getByRole("region", { name: /Your cart/ })).toBeInTheDocument();
        expect(currentPathname()).toBe("/shop");
    });

    test("any other failure shows the server's reason and keeps the bag open", async () => {
        storeCart([bag]);
        const checkout = vi.fn(() => response({ status: "error", message: "Unable to update your hold right now. Please try again." }, 500));
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        expect(await screen.findByText("Unable to update your hold right now. Please try again.")).toBeInTheDocument();
        expect(screen.getByRole("region", { name: /Your cart/ })).toBeInTheDocument();
        expect(currentPathname()).toBe("/shop");
    });

    test("an other failure with no reason shows the fixed checkout notice", async () => {
        storeCart([bag]);
        const checkout = vi.fn(() => response({}, 500));
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        expect(await screen.findByText("Unable to start checkout. Please try again later.")).toBeInTheDocument();
        expect(currentPathname()).toBe("/shop");
    });

    test("blocks checkout when a product's units across sizes exceed its limit, before any sign-in or request", async () => {
        storeCart([{ sku: hoodie.sku, size: "M", quantity: 1 }, { sku: hoodie.sku, size: "L", quantity: 1 }]);
        const checkout = vi.fn(checkoutStarted);
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        expect(await screen.findByText("Hoodie is limited to 1 per student. Lower the quantity in your cart.")).toBeInTheDocument();
        expect(checkout).not.toHaveBeenCalled();
        expect(auth.signIn).not.toHaveBeenCalled();
        expect(currentPathname()).toBe("/shop");
        expect(screen.getByRole("region", { name: /Your cart/ })).toBeInTheDocument();
    });

    test("allows checkout when every product is within its limit", async () => {
        storeCart([bag, hoodie]);
        const checkout = vi.fn(checkoutStarted);
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        await waitFor(() => expect(currentPathname()).toBe(checkoutPath));
        expect(checkout).toHaveBeenCalledTimes(1);
    });

    test("a stale-catalog 409 forces a fresh catalog even just after loading and requires another confirmation", async () => {
        storeCart([bag]);
        const checkout = vi.fn(() => response({}, 409));
        const api = mockApi({ checkout });
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
            if (url === "/api/v1/shop/holds" && options.method === "POST") return checkout(options);
            throw new Error(`Unexpected API request: ${url}`);
        });
        fireEvent.click(await openCart());

        expect(await screen.findByText(/catalog has updated or the sale status changed/i)).toBeInTheDocument();
        expect(api.mock.calls.filter(([url]) => url === "/api/v1/shop/catalog").length).toBe(initialCatalogRequests + 1);
        expect(screen.getByRole("button", { name: "Checkout" })).toBeDisabled();
        expect(screen.getByRole("region", { name: /Your cart/ })).toBeInTheDocument();
        expect(checkout).toHaveBeenCalledTimes(1);
        expect(currentPathname()).toBe("/shop");
        expect(screen.getByRole("button", { name: "Cart, 1 item" })).toBeInTheDocument();
    });

    test("a 409 from a hold request shows the server's reason instead of the catalog notice", async () => {
        storeCart([bag]);
        const checkout = vi.fn(() => response({ status: "error", message: "Hoodie is limited to 1 per student." }, 409));
        mockApi({ checkout });
        renderShop();
        fireEvent.click(await openCart());

        expect(await screen.findByText("Hoodie is limited to 1 per student.")).toBeInTheDocument();
        expect(screen.queryByText(/catalog has updated/i)).not.toBeInTheDocument();
        expect(screen.getByRole("region", { name: /Your cart/ })).toBeInTheDocument();
    });

    test("both product and bag quantity controls stop at 100", async () => {
        storeCart([{ ...bag, quantity: 100 }]);
        mockApi();
        renderShop();
        fireEvent.click(screen.getByRole("button", { name: "Increase INFO Tote Bag" }));
        expect(bagQuantity()).toHaveValue("100");
        await openCart();
        fireEvent.click(screen.getByRole("button", { name: "Increase INFO Tote Bag One Size" }));

        expect(screen.getByRole("textbox", { name: "INFO Tote Bag size One Size quantity. Type a number from 1 to 100." })).toHaveValue("100");
        expect(bagQuantity()).toHaveValue("100");
        expect(screen.getByRole("button", { name: "Cart, 100 items" })).toBeInTheDocument();
    });
});

describe("per-student limit in the bag", () => {
    test("steppers and typed quantities stop at the limit, counted across sizes", async () => {
        storeCart([{ ...hoodie, size: "M" }]);
        mockApi();
        renderShop();
        await openCart();
        const dialog = screen.getByRole("region", { name: /Your cart/ });
        const quantity = within(dialog).getByRole("textbox", { name: "Hoodie size M quantity. Type a number from 1 to 100." });

        await waitFor(() => expect(within(dialog).getByRole("button", { name: "Increase Hoodie M" })).toBeDisabled());
        fireEvent.change(quantity, { target: { value: "3" } });
        fireEvent.blur(quantity);
        expect(quantity).toHaveValue("1");
    });

    test("Add to cart is disabled for a product whose limit is already in the bag in another size", async () => {
        storeCart([{ ...hoodie, size: "M" }]);
        mockApi();
        renderShop();
        const card = (await screen.findByRole("heading", { name: "Hoodie" })).closest("article");
        fireEvent.click(within(card).getByRole("button", { name: "L" }));

        expect(within(card).getByRole("button", { name: "Add to cart" })).toBeDisabled();
    });

    test("the cart line shows the per-student limit only once it is reached", async () => {
        storeCart([{ ...hoodie, size: "M" }, bag]);
        mockApi();
        renderShop();
        await openCart();

        const dialog = within(screen.getByRole("region", { name: /Your cart/ }));
        expect(await dialog.findByText("Limit 1 per student")).toBeInTheDocument();
        expect(dialog.queryByText("Limit 5 per student")).not.toBeInTheDocument();
    });
});

describe("paid checkout returns", () => {
    test("reloading an already processed paid return preserves newly added items without a cart mismatch", async () => {
        storeCart([bag], [bag]);
        const verify = vi.fn(() => response({ paymentStatus: "paid" }));
        mockApi({ verify });
        const firstVisit = renderShop(returnUrl);

        await waitFor(() => expect(screen.queryByText(/checking your payment/i)).not.toBeInTheDocument());
        expect(screen.getByRole("button", { name: "Shopping cart, empty" })).toBeInTheDocument();
        fireEvent.click(within(screen.getByRole("heading", { name: "INFO Tote Bag" }).closest("article"))
            .getByRole("button", { name: "Add to cart" }));
        fireEvent.click(screen.getByRole("button", { name: "Close cart" }));
        expect(bagQuantity()).toHaveValue("1");

        firstVisit.unmount();
        const verificationsBeforeReload = verify.mock.calls.length;
        renderShop(returnUrl);

        await waitFor(() => expect(verify.mock.calls.length).toBeGreaterThan(verificationsBeforeReload));
        await waitFor(() => expect(screen.queryByText(/checking your payment/i)).not.toBeInTheDocument());
        expect(screen.queryByText(/could not match your cart/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/could not confirm payment/i)).not.toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("1");
        expect(screen.getByRole("button", { name: "Cart, 1 item" })).toBeInTheDocument();
    });

    test("subtracts only the handed-off quantities, preserving later additions of the same and other products", async () => {
        storeCart([{ ...bag, quantity: 3 }, hoodie], [bag]);
        mockApi();
        renderShop(returnUrl);

        await waitFor(() => expect(bagQuantity()).toHaveValue("2"));
        expect(screen.getByRole("textbox", { name: "Hoodie L quantity. Type a number from 1 to 100." })).toHaveValue("1");
        expect(screen.getByRole("button", { name: "Cart, 3 items" })).toBeInTheDocument();
    });

    test.each([
        ["pending payment", () => response({ paymentStatus: "pending" })],
        ["unpaid payment", () => response({ paymentStatus: "unpaid" })],
        ["another buyer's session", () => response({}, 404)],
        ["expired authentication", () => response({}, 401)],
        ["unavailable verification", () => response({}, 503)],
    ])("a return with %s cannot subtract the cart or claim payment, even with a processed marker", async (_, verify) => {
        storeCart([bag], [bag]);
        mockApi({ verify });
        const firstVisit = renderShop(returnUrl);

        expect(await screen.findByText(/could not confirm payment/i)).toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("1");
        firstVisit.unmount();

        // A browser marker is never proof of payment, even if it is forged.
        sessionStorage.setItem(handoffKey, "processed");
        renderShop(returnUrl);
        expect(await screen.findByText(/could not confirm payment/i)).toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("1");
    });

    test("waits for fresh server verification on reload before accepting a processed return", async () => {
        storeCart([bag], [bag]);
        let resolveVerification;
        const recheck = new Promise((resolve) => { resolveVerification = resolve; });
        const verify = vi.fn(() => response({ paymentStatus: "paid" }));
        mockApi({ verify });
        const firstVisit = renderShop(returnUrl);
        await waitFor(() => expect(screen.getByRole("button", { name: "Shopping cart, empty" })).toBeInTheDocument());
        firstVisit.unmount();

        storeCart([bag]);
        verify.mockImplementation(() => recheck);
        renderShop(returnUrl);
        expect(screen.getByText(/checking your payment/i)).toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("1");
        await act(async () => resolveVerification(response({ paymentStatus: "paid" })));

        expect(screen.queryByText(/checking your payment|could not match your cart|could not confirm payment/i)).not.toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("1");
    });

    test("a failed verification can be retried by reloading without consuming the saved cart prematurely", async () => {
        storeCart([{ ...bag, quantity: 2 }], [bag]);
        const verify = vi.fn(() => response({}, 503));
        mockApi({ verify });
        const firstVisit = renderShop(returnUrl);
        expect(await screen.findByText(/could not confirm payment/i)).toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("2");
        firstVisit.unmount();

        verify.mockImplementation(() => response({ paymentStatus: "paid" }));
        renderShop(returnUrl);
        await waitFor(() => expect(bagQuantity()).toHaveValue("1"));
        expect(screen.queryByText(/could not match your cart|could not confirm payment/i)).not.toBeInTheDocument();
    });

    test.each([null, "not JSON", "[]", '{"quantity":1}'])("a never-processed missing or corrupt handoff (%s) keeps the cart and gives the truthful mismatch notice", async (savedCart) => {
        storeCart([bag]);
        if (savedCart !== null) sessionStorage.setItem(handoffKey, savedCart);
        mockApi();
        renderShop(returnUrl);

        expect(await screen.findByText(/payment confirmed, but we could not match your cart/i)).toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("1");
    });

    test("requires sign-in before verifying a return and does not trust the complete query alone", async () => {
        auth.isAuthenticated = false;
        storeCart([bag], [bag]);
        const verify = vi.fn();
        mockApi({ verify });
        renderShop(returnUrl);

        expect(screen.getByText(/sign in to confirm your payment/i)).toBeInTheDocument();
        await act(async () => {});
        expect(verify).not.toHaveBeenCalled();
        expect(bagQuantity()).toHaveValue("1");
    });

    test.each([
        ["getItem", handoffKey],
        ["getItem", "iuga_shop_cart"],
        ["setItem", handoffKey],
        ["setItem", "iuga_shop_cart"],
    ])("a storage failure in %s for %s never clears the cart", async (method, blockedKey) => {
        storeCart([bag], [bag]);
        let resolveVerification;
        const verification = new Promise((resolve) => { resolveVerification = resolve; });
        mockApi({ verify: () => verification });
        renderShop(returnUrl);
        await act(async () => {});
        const original = Storage.prototype[method];
        vi.spyOn(Storage.prototype, method).mockImplementation(function (key, ...args) {
            if (key === blockedKey) throw new Error("Storage unavailable");
            return original.call(this, key, ...args);
        });

        await act(async () => resolveVerification(response({ paymentStatus: "paid" })));
        expect(screen.getByText(/could not confirm payment/i)).toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("1");
        expect(screen.getByRole("button", { name: "Cart, 1 item" })).toBeInTheDocument();
    });

    test("a failed cart write cannot leave a handoff that subtracts newly added items on the next return", async () => {
        storeCart([bag], [bag]);
        let resolveVerification;
        const verification = new Promise((resolve) => { resolveVerification = resolve; });
        mockApi({ verify: () => verification });
        const firstVisit = renderShop(returnUrl);
        await act(async () => {});
        const original = Storage.prototype.setItem;
        const storageWrite = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (key, value) {
            if (key === "iuga_shop_cart") throw new Error("Storage unavailable");
            return original.call(this, key, value);
        });
        await act(async () => resolveVerification(response({ paymentStatus: "paid" })));
        expect(screen.getByText(/could not confirm payment/i)).toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("1");

        storageWrite.mockRestore();
        fireEvent.click(screen.getByRole("button", { name: "Increase INFO Tote Bag" }));
        expect(bagQuantity()).toHaveValue("2");
        firstVisit.unmount();
        renderShop(returnUrl);

        await waitFor(() => expect(screen.queryByText(/checking your payment/i)).not.toBeInTheDocument());
        expect(screen.queryByText(/could not match your cart|could not confirm payment/i)).not.toBeInTheDocument();
        expect(bagQuantity()).toHaveValue("2");
    });
});
