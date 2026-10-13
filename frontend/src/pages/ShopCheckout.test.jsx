/*
 * Purpose: Venmo checkout page behavior: the amount due, username entry, confirmation, line removal,
 *          expiry, sign-in, and closed checkout.
 * Authentication/Authorization Requirements: Auth and API boundaries are mocked; no live payments.
 * Expected Request Information: Student actions on the held cart and the hold API responses.
 * Expected Response Information: Visible amounts, notices, and the cart contents left in the session.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    it("shows each line and the exact total with no tax", async () => {
        mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }) });
        renderCheckout();

        expect(await screen.findByText("1 × Hoodie, size M")).toBeInTheDocument();
        expect(screen.getByText("2 × Tote Bag, size One Size")).toBeInTheDocument();
        expect(screen.getByText(/Total due:/)).toHaveTextContent("$72.00");
        expect(screen.getByText("Time remaining")).toBeInTheDocument();
    });

    it("shows the Venmo QR code and payment handle while the hold is open", async () => {
        mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }) });
        renderCheckout();

        const payment = await screen.findByRole("region", { name: "Pay with Venmo" });
        expect(within(payment).getByRole("img", { name: "Venmo QR code for IUGA UW, @iuga-uw" })).toBeInTheDocument();
        expect(within(payment).getByText("@IUGA-UW")).toBeInTheDocument();
    });

    it("marks both fields required and keeps Confirm locked until both are valid", async () => {
        const api = mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }) });
        renderCheckout();
        const confirmButton = await screen.findByRole("button", { name: "Confirm purchase" });

        expect(confirmButton).toBeDisabled();
        expect(screen.getByLabelText("Venmo username")).toBeRequired();
        expect(screen.getByLabelText("Phone number")).toBeRequired();
        expect(screen.queryByText("Enter your Venmo username.")).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText("Venmo username"), { target: { value: "jane.doe" } });
        expect(confirmButton).toBeDisabled();

        fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "(206) 555-0123" } });
        expect(confirmButton).toBeEnabled();
        expect(api.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    });

    it("prefills the Venmo username saved by an earlier purchase", async () => {
        mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold(), savedVenmoUsername: "jane.doe" }),
        });
        renderCheckout();
        await screen.findByRole("button", { name: "Confirm purchase" });

        expect(screen.getByLabelText("Venmo username")).toHaveValue("jane.doe");
    });

    it("blocks a different Venmo username than the saved one and offers an email to IUGA", async () => {
        const api = mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold(), savedVenmoUsername: "jane.doe" }),
        });
        renderCheckout();
        const confirmButton = await screen.findByRole("button", { name: "Confirm purchase" });
        fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "2065550123" } });
        expect(confirmButton).toBeEnabled();

        fireEvent.change(screen.getByLabelText("Venmo username"), { target: { value: "someone.else" } });

        expect(screen.getByRole("alert")).toHaveTextContent("This doesn’t match the Venmo username on your account.");
        expect(confirmButton).toBeDisabled();
        const gmail = screen.getByRole("link", { name: "Open in Gmail", hidden: true });
        const body = new URL(gmail.getAttribute("href")).searchParams.get("body");
        expect(body).toContain("Current Venmo username: jane.doe");
        expect(body).toContain("New Venmo username: someone.else");

        // The same account in different letter case is not a mismatch.
        fireEvent.change(screen.getByLabelText("Venmo username"), { target: { value: "@Jane.Doe" } });
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(confirmButton).toBeEnabled();
        expect(api.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    });

    it("explains an invalid Venmo username once the field is left, and keeps Confirm locked", async () => {
        const api = mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }) });
        renderCheckout();
        await screen.findByRole("button", { name: "Confirm purchase" });

        const username = screen.getByLabelText("Venmo username");
        fireEvent.change(username, { target: { value: "jane doe" } });
        fireEvent.blur(username);

        expect(await screen.findByText("Use 1 to 30 letters, numbers, periods, hyphens, or underscores.")).toBeInTheDocument();
        expect(username).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("button", { name: "Confirm purchase" })).toBeDisabled();
        expect(api.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(0);
    });

    it("explains a phone number that is too short once the field is left, and accepts an international one", async () => {
        mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold() }) });
        renderCheckout();
        await screen.findByRole("button", { name: "Confirm purchase" });

        fireEvent.change(screen.getByLabelText("Venmo username"), { target: { value: "jane.doe" } });
        const phone = screen.getByLabelText("Phone number");
        fireEvent.change(phone, { target: { value: "555-01" } });
        fireEvent.blur(phone);

        expect(await screen.findByText("Use 7 to 15 digits. Add your country code if it isn’t a US number.")).toBeInTheDocument();
        expect(phone).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("button", { name: "Confirm purchase" })).toBeDisabled();

        fireEvent.change(phone, { target: { value: "+44 20 7946 0958" } });
        expect(phone).not.toHaveAttribute("aria-invalid");
        expect(screen.getByRole("button", { name: "Confirm purchase" })).toBeEnabled();
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

        fireEvent.change(screen.getByLabelText("Venmo username"), { target: { value: " @jane.doe " } });
        fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "(206) 555-0123" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));

        expect(await screen.findByRole("heading", { name: "Your purchase is submitted" })).toBeInTheDocument();
        expect(screen.getByText(/contact you when your merch is ready for pickup/)).toBeInTheDocument();
        expect(JSON.parse(confirm.mock.calls[0][0].body)).toEqual({ venmoUsername: "jane.doe", phoneNumber: "2065550123" });
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

        fireEvent.change(screen.getByLabelText("Venmo username"), { target: { value: "jane.doe" } });
        fireEvent.change(screen.getByLabelText("Phone number"), { target: { value: "2065550123" } });
        fireEvent.click(screen.getByRole("button", { name: "Confirm purchase" }));

        expect(await screen.findByText("This hold has expired. Its items have been released.")).toBeInTheDocument();
        expect(await screen.findByRole("alert")).toHaveTextContent("Your checkout timed out");
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

    it("shows an expired hold without a form, with an email option and a way back to the shop", async () => {
        mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: response({
                status: "success",
                hold: hold({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
            }),
        });
        renderCheckout();

        expect(await screen.findByRole("alert")).toHaveTextContent("Your checkout timed out");
        expect(screen.queryByLabelText("Venmo username")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Email IUGA" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Start again from the shop" })).toBeInTheDocument();
    });

    it("prefills the email to IUGA with the hold ID, its items, and the total", async () => {
        mockApi({
            [`GET /api/v1/shop/holds/${holdId}`]: response({
                status: "success",
                hold: hold({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
            }),
        });
        renderCheckout();

        const gmail = await screen.findByRole("link", { name: "Open in Gmail", hidden: true });
        expect(screen.getByText("IUGA Shop")).toBeInTheDocument();
        expect(screen.queryByText("Contact the committee")).not.toBeInTheDocument();
        const compose = new URL(gmail.getAttribute("href"));
        expect(compose.searchParams.get("to")).toBe("iuga@uw.edu");
        expect(compose.searchParams.get("su")).toBe("I paid on Venmo but my checkout timed out");
        expect(compose.searchParams.get("body")).toContain(`Hold ID: ${holdId}`);
        expect(compose.searchParams.get("body")).toContain("Total: $72.00");
        expect(compose.searchParams.get("body")).toContain("2 × Tote Bag, size One Size");
    });

    it.each([
        ["confirmed", "This checkout is confirmed. Your purchase is pending review."],
        ["cancelled", "This checkout was cancelled. Your items were released."],
    ])("shows no countdown, payment prompt, or form for a %s hold", async (status, statusText) => {
        mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold({ status }) }) });
        renderCheckout();

        expect(await screen.findByText(statusText)).toBeInTheDocument();
        expect(screen.queryByText("Time remaining")).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Pay with Venmo" })).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Venmo username")).not.toBeInTheDocument();
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

    it("counts down on a cancelled checkout, then returns the student to the shop", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold({ status: "cancelled", lines: [], totalCents: 0 }) }) });
            renderCheckout();

            expect(await screen.findByText(/Returning you to the shop in 5 seconds\./)).toBeInTheDocument();
            expect(screen.getByRole("link", { name: "Go to the shop now" })).toHaveAttribute("href", "/shop");

            // Each second schedules the next, so the clock moves one second at a time.
            for (let second = 0; second < 4; second += 1) {
                await act(() => vi.advanceTimersByTimeAsync(1000));
            }
            expect(screen.getByText(/Returning you to the shop in 1 second\./)).toBeInTheDocument();

            await act(() => vi.advanceTimersByTimeAsync(1000));
            expect(screen.getByText("Shop page")).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it("returns the student to the shop after they remove the last item", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            mockApi({
                [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold({ lines: [hoodieLine], totalCents: 3200 }) }),
                [`PATCH /api/v1/shop/holds/${holdId}/lines`]: response({ status: "success", hold: hold({ status: "cancelled", lines: [], totalCents: 0 }) }),
            });
            renderCheckout();
            fireEvent.click(await screen.findByRole("button", { name: "Remove Hoodie, size M" }));

            expect(await screen.findByText("That was the last item, so your hold is cancelled. Your cart is empty.")).toBeInTheDocument();
            expect(screen.getByText(/Returning you to the shop in 5 seconds\./)).toBeInTheDocument();

            for (let second = 0; second < 5; second += 1) {
                await act(() => vi.advanceTimersByTimeAsync(1000));
            }
            expect(screen.getByText("Shop page")).toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it("does not send a student away from a confirmed checkout", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            mockApi({ [`GET /api/v1/shop/holds/${holdId}`]: response({ status: "success", hold: hold({ status: "confirmed" }) }) });
            renderCheckout();

            expect(await screen.findByText("This checkout is confirmed. Your purchase is pending review.")).toBeInTheDocument();
            await act(() => vi.advanceTimersByTimeAsync(10000));
            expect(screen.queryByText("Shop page")).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
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
