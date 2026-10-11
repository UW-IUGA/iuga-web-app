/*
 * Purpose: Venmo checkout page behavior: the amount due, username entry, confirmation, line removal,
 *          expiry, sign-in, and closed checkout.
 * Authentication/Authorization Requirements: Auth and API boundaries are mocked; no live payments.
 * Expected Request Information: Student actions on the held cart and the hold API responses.
 * Expected Response Information: Visible amounts, notices, and the cart contents left in the session.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ShopCartProvider } from "../context/ShopCartContext";
import ShopCheckoutPage from "./ShopCheckout";

const auth = vi.hoisted(() => ({ isAuthenticated: true, signIn: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuthContext: () => auth }));

const holdId = "64b000000000000000000001";
const hoodieLine = { sku: "info-hoodie", name: "Hoodie", size: "M", quantity: 1, unitPriceCents: 3200 };
const toteLine = { sku: "info-tote-bag", name: "Tote Bag", size: "One Size", quantity: 2, unitPriceCents: 2000 };
const catalog = {
    catalogId: "fall-2026",
    catalogVersion: "fall-2026-v1",
    saleState: "open",
    currency: "usd",
    items: [
        { sku: hoodieLine.sku, name: hoodieLine.name, sizes: ["M"], unitPriceCents: hoodieLine.unitPriceCents },
        { sku: toteLine.sku, name: toteLine.name, sizes: [toteLine.size], unitPriceCents: toteLine.unitPriceCents },
    ],
};

function response(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function hold(overrides = {}) {
    return {
        id: holdId,
        status: "active",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        lines: [hoodieLine, toteLine],
        totalCents: 7200,
        ...overrides,
    };
}

// Routes each request by method and path. A handler may be a response object or a function returning one.
function mockApi(handlers = {}) {
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
        const method = options.method || "GET";
        if (url === "/api/v1/shop/catalog") return response({ status: "success", catalog });
        const key = `${method} ${url}`;
        const handler = handlers[key];
        if (handler === undefined) throw new Error(`Unexpected API request: ${key}`);
        return typeof handler === "function" ? handler(options) : handler;
    });
}

function renderCheckout(path = `/shop/checkout/${holdId}`) {
    return render(
        <MemoryRouter initialEntries={[path]}>
            <ShopCartProvider>
                <Routes>
                    <Route path="/shop/checkout/:holdId" element={<ShopCheckoutPage />} />
                    <Route path="/shop" element={<p>Shop page</p>} />
                </Routes>
            </ShopCartProvider>
        </MemoryRouter>
    );
}

function storeCart(cart) {
    sessionStorage.setItem("iuga_shop_cart", JSON.stringify(cart));
    sessionStorage.setItem("iuga_shop_catalog", JSON.stringify({ timestamp: Date.now(), catalog }));
}

function storedCart() {
    return JSON.parse(sessionStorage.getItem("iuga_shop_cart") || "[]");
}

beforeEach(() => {
    auth.isAuthenticated = true;
    auth.signIn.mockReset();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    storeCart([
        { sku: "info-hoodie", size: "M", quantity: 1 },
        { sku: "info-tote-bag", size: "One Size", quantity: 2 },
    ]);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
});

describe("ShopCheckoutPage", () => {
    it("shows the IUGA Venmo handle, each line, and the exact total with no tax", async () => {
        mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }) });
        renderCheckout();

        expect(await screen.findByText(/Pay \$72\.00 to/)).toBeInTheDocument();
        expect(screen.getByText("IUGA-UW")).toBeInTheDocument();
        expect(screen.getByText("1 × Hoodie, size M")).toBeInTheDocument();
        expect(screen.getByText("2 × Tote Bag, size One Size")).toBeInTheDocument();
        expect(screen.getByText("$72.00")).toBeInTheDocument();
        expect(screen.getByText(/Your items are held for/)).toBeInTheDocument();
    });

    it("rejects an invalid Venmo username without sending a request", async () => {
        const api = mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }) });
        renderCheckout();
        await screen.findByRole("button", { name: "Confirm purchase" });

        fireEvent.change(screen.getByLabelText("Your Venmo username"), { target: { value: "jane doe" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));

        expect(await screen.findByText(/Enter your Venmo username/)).toBeInTheDocument();
        expect(api.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    });

    it("confirms with the normalized username, shows the pending purchase, and empties the bag", async () => {
        const confirm = vi.fn(() => response({
            status: "success",
            purchase: {
                id: "64b0000000000000000000ff",
                status: "pending",
                venmoUsername: "jane.doe",
                totalCents: 7200,
                confirmedAt: new Date().toISOString(),
            },
        }));
        mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }),
            [`POST /api/v1/shop/holds/${holdId}/confirm`]: confirm,
        });
        renderCheckout();
        await screen.findByRole("button", { name: "Confirm purchase" });

        fireEvent.change(screen.getByLabelText("Your Venmo username"), { target: { value: " @jane.doe " } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));

        expect(await screen.findByRole("heading", { name: "Purchase submitted" })).toBeInTheDocument();
        expect(screen.getByText(/pending review/)).toBeInTheDocument();
        expect(JSON.parse(confirm.mock.calls[0][0].body)).toEqual({ venmoUsername: "jane.doe" });
        expect(storedCart()).toEqual([]);
    });

    it("shows the server's message after a late confirmation, then shows the expired hold", async () => {
        let status = "active";
        mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: () => response({ status: "success", hold: hold({ status }) }),
            [`POST /api/v1/shop/holds/${holdId}/confirm`]: () => {
                status = "expired";
                return response({ status: "error", message: "This hold has expired. Its items have been released." }, 409);
            },
        });
        renderCheckout();
        await screen.findByRole("button", { name: "Confirm purchase" });

        fireEvent.change(screen.getByLabelText("Your Venmo username"), { target: { value: "jane.doe" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));

        expect(await screen.findByText("This hold has expired. Its items have been released.")).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent("This hold has expired");
        expect(screen.queryByRole("button", { name: "Confirm purchase" })).not.toBeInTheDocument();
        expect(storedCart()).toHaveLength(2);
    });

    it("removes a line from the hold and from the bag, and keeps the deadline", async () => {
        const patch = vi.fn(() => response({
            status: "success",
            hold: hold({ lines: [toteLine], totalCents: 4000 }),
        }));
        mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }),
            [`PATCH /api/v1/shop/holds/${holdId}/lines`]: patch,
        });
        renderCheckout();
        fireEvent.click(await screen.findByRole("button", { name: "Remove Hoodie, size M" }));

        await waitFor(() => expect(screen.queryByText("1 × Hoodie, size M")).not.toBeInTheDocument());
        expect(JSON.parse(patch.mock.calls[0][0].body)).toEqual({ sku: "info-hoodie", size: "M" });
        expect(storedCart()).toEqual([{ sku: "info-tote-bag", size: "One Size", quantity: 2 }]);
        expect(screen.getByText(/Total due:/)).toHaveTextContent("$40.00");
    });

    it("shows an expired hold without a form and points back to the shop", async () => {
        mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: response({
                status: "success",
                hold: hold({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
            }),
        });
        renderCheckout();

        expect(await screen.findByRole("alert")).toHaveTextContent("This hold has expired");
        expect(screen.queryByLabelText("Your Venmo username")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Return to the shop" })).toBeInTheDocument();
    });

    it.each([
        ["confirmed", "This checkout is confirmed. Your purchase is pending review."],
        ["cancelled", "This checkout was cancelled. Your items were released."],
    ])("shows no countdown, payment prompt, or form for a %s hold", async (status, statusText) => {
        mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold({ status }) }) });
        renderCheckout();

        expect(await screen.findByText(statusText)).toBeInTheDocument();
        expect(screen.queryByText(/Your items are held for/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Pay \$72\.00 to/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Your Venmo username")).not.toBeInTheDocument();
    });

    it("asks a signed-out student to sign in before showing the hold", async () => {
        auth.isAuthenticated = false;
        mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "error" }, 401) });
        renderCheckout();

        expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
    });

    it("shows the closed-checkout message when manual checkout is not open", async () => {
        mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: response({
                status: "error",
                message: "Online checkout is temporarily unavailable. Your cart has not changed; please check back later.",
            }, 503),
        });
        renderCheckout();

        expect(await screen.findByRole("heading", { name: "Checkout is unavailable" })).toBeInTheDocument();
        expect(screen.getByText(/Your cart has not changed/)).toBeInTheDocument();
    });

    it("cancels the hold and returns to the shop with the bag unchanged", async () => {
        const cancel = vi.fn(() => response({ status: "success", hold: hold({ status: "cancelled" }) }));
        mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }),
            [`DELETE /api/v1/shop/holds/${holdId}`]: cancel,
        });
        renderCheckout();
        fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

        expect(await screen.findByText("Shop page")).toBeInTheDocument();
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(storedCart()).toHaveLength(2);
    });
});
