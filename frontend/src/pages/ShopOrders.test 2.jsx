/*
 * Purpose: Officer Orders page behavior: the overview of what is still owed, finding orders with filters
 *          and search, reading one order in a drawer, contacting the student, recording the amount
 *          received, marking orders paid one at a time or together, and moving a paid order back to
 *          Unconfirmed, with each change confirmed first.
 * Authentication/Authorization Requirements: Auth and the review API are mocked; no live orders.
 * Expected Request Information: Officer actions and review API responses.
 * Expected Response Information: Visible orders, the drawer, confirmations, announcements, and the requests sent.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ShopOrdersPage from "./ShopOrders";

const auth = vi.hoisted(() => ({
    isAuthenticated: true,
    authLoading: false,
    user: { _id: "officer-1", uFirstName: "Olive" },
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: () => true,
}));
vi.mock("../context/AuthContext", () => ({ useAuthContext: () => auth }));

const ORDER_ID = "64b0000000000000000000ff";
const OTHER_ID = "64b0000000000000000000ee";
const LIST = "/api/v1/shop/purchases";
const PENDING = `GET ${LIST}?status=pending&followUp=all`;
const COUNTS = `GET ${LIST}/counts`;
const COUNT_VALUES = { pending: 7, paid: 3, ready: 1, picked_up: 2, not_paid: 2, refunded: 1, all: 13, short: 1, awaiting: 2, says_paid: 1 };
const TOTALS = { expectedCents: 31200, receivedCents: 11200, owedCents: 20000, pendingOrders: 7, receivedOrders: 3, confirmedCents: 25600 };
const CONFLICT = "Another officer updated this order. Review the latest details before choosing an action.";

function order(overrides = {}) {
    return {
        id: ORDER_ID,
        buyer: { id: "64b0000000000000000000bb", name: "Example Student", email: "example@uw.edu" },
        venmoUsername: "example-student",
        lines: [
            { sku: "info-hoodie", name: "Hoodie", size: "M", quantity: 1, unitPriceCents: 3200, lineTotalCents: 3200 },
            { sku: "info-tote-bag", name: "Tote Bag", size: "One Size", quantity: 2, unitPriceCents: 2000, lineTotalCents: 4000 },
        ],
        totalCents: 7200,
        amountReceivedCents: null,
        confirmedAt: "2030-02-27T17:30:00.000Z",
        status: "pending",
        revision: 3,
        followUp: { status: null, updatedBy: null, updatedAt: null },
        pickup: { pickedUpAt: null, pickedUpBy: null },
        history: [],
        ...overrides,
    };
}

// The single-order read adds the buyer's phone number, which the list never includes.
function detailed(overrides = {}) {
    const base = order(overrides);
    return { ...base, buyer: base.buyer && { ...base.buyer, phone: "2065550100", ...overrides.buyer } };
}

const otherOrder = (overrides = {}) => order({
    id: OTHER_ID,
    buyer: { id: "b2", name: "Marco Reyes", email: "mreyes@uw.edu" },
    venmoUsername: "mreyes-ux",
    lines: [{ sku: "info-tote-bag", name: "Tote Bag", size: "One Size", quantity: 1, unitPriceCents: 2000, lineTotalCents: 2000 }],
    totalCents: 2000,
    revision: 0,
    ...overrides,
});

function response(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function listed(purchases, nextCursor = null) {
    return response({ status: "success", purchases, nextCursor });
}

function saved(purchase) {
    return response({ status: "success", purchase });
}

// Routes each request by method and full URL. A handler may be a response or a function of the request
// options. Counts and totals answer by default.
function mockApi(handlers) {
    const routes = { [COUNTS]: response({ status: "success", counts: COUNT_VALUES, totals: TOTALS }), ...handlers };
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
        const key = `${options.method || "GET"} ${url}`;
        const handler = routes[key];
        if (handler === undefined) throw new Error(`Unexpected API request: ${key}`);
        return typeof handler === "function" ? handler(options) : handler;
    });
}

function writes(fetchSpy) {
    return fetchSpy.mock.calls
        .filter(([, options = {}]) => options.method === "PATCH")
        .map(([url, options]) => ({ url, body: JSON.parse(options.body) }));
}

function requestedUrls(fetchSpy) {
    return fetchSpy.mock.calls.map(([url]) => url);
}

async function expectAnnounced(text) {
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text));
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/admin/shop/orders"]}>
            <ShopOrdersPage />
        </MemoryRouter>
    );
}

async function findRow(buyerName = "Example Student") {
    const table = await screen.findByRole("table", { name: "Orders" });
    return (await within(table).findByRole("button", { name: buyerName })).closest("tbody");
}

// Opens an order's drawer from its customer button.
async function openDrawer(buyerName = "Example Student") {
    fireEvent.click(within(await findRow(buyerName)).getByRole("button", { name: buyerName }));
    return screen.getByRole("dialog", { name: /^Order / });
}

// Contact details stay in a dropdown until the officer asks for them.
async function openContact(drawer) {
    fireEvent.click(within(drawer).getByRole("button", { name: "Contact" }));
    const region = within(drawer).getByRole("region", { name: "Contact details" });
    await waitFor(() => expect(within(region).queryByText("Loading contact details…")).not.toBeInTheDocument());
    return region;
}

// Opens a "···" menu and chooses one of its items.
function chooseAction(container, triggerName, itemName) {
    fireEvent.click(within(container).getByRole("button", { name: triggerName }));
    fireEvent.click(within(screen.getByRole("menu", { name: "Order actions" })).getByRole("menuitem", { name: itemName }));
}

function confirmDialog(name) {
    return screen.getByRole("dialog", { name });
}

// Opens the Gmail compose link without leaving jsdom, so the dialog's own steps can be checked.
function openInGmail() {
    const gmail = screen.getByRole("link", { name: "Open in Gmail" });
    gmail.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(gmail);
}

// The Gmail compose link carries the draft the officer is about to send, so tests read it from there.
function gmailDraft(field) {
    return new URL(screen.getByRole("link", { name: "Open in Gmail" }).getAttribute("href")).searchParams.get(field);
}

beforeEach(() => {
    auth.isAuthenticated = true;
    auth.authLoading = false;
    auth.user = { _id: "officer-1", uFirstName: "Olive" };
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("admin bar", () => {
    it("names the tool, links back to the site, and signs the officer out", async () => {
        mockApi({ [PENDING]: listed([order()]) });
        renderPage();

        const bar = screen.getByRole("banner");
        expect(bar).toHaveTextContent("IUGA Admin");
        expect(within(bar).getByRole("link", { name: "Back to site" })).toHaveAttribute("href", "/");
        expect(bar).toHaveTextContent("Olive");
        fireEvent.click(within(bar).getByRole("button", { name: "Sign out" }));
        expect(auth.signOut).toHaveBeenCalled();
        await findRow();
    });
});

describe("finding orders", () => {
    it("shows money still unconfirmed, money received on confirmed orders, and open follow-ups", async () => {
        mockApi({ [PENDING]: listed([order()]) });
        renderPage();

        const overview = await screen.findByRole("group", { name: "Overview" });
        await waitFor(() => expect(overview).toHaveTextContent("Unconfirmed$200.007 orders · $112.00 received"));
        expect(overview).toHaveTextContent("Confirmed$256.003 orders");
        expect(overview).toHaveTextContent("Follow-up2 orders1 says they already paid");
        expect(overview).not.toHaveTextContent("Expected");
    });

    it("leaves out the received note and the says-paid note when there is nothing to say", async () => {
        mockApi({
            [PENDING]: listed([]),
            [COUNTS]: response({
                status: "success",
                counts: { ...COUNT_VALUES, pending: 0, says_paid: 0 },
                totals: { ...TOTALS, expectedCents: 0, receivedCents: 0, owedCents: 0, pendingOrders: 0, receivedOrders: 0 },
            }),
        });
        renderPage();

        const overview = await screen.findByRole("group", { name: "Overview" });
        await waitFor(() => expect(overview).toHaveTextContent("Unconfirmed$0.000 orders"));
        expect(overview).not.toHaveTextContent("received");
        expect(overview).toHaveTextContent("Follow-up2 ordersopen on any order");
    });

    it("opens the Unconfirmed and Follow-up tabs from their overview cards; Confirmed is not a link", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}?status=all&followUp=awaiting`]: listed([]) });
        renderPage();

        const overview = await screen.findByRole("group", { name: "Overview" });
        await waitFor(() => expect(overview).toHaveTextContent("Follow-up2 orders"));
        fireEvent.click(within(overview).getByRole("button", { name: /^Follow-up/ }));
        expect(screen.getByRole("tab", { name: /^Follow-up/ })).toHaveAttribute("aria-selected", "true");
        fireEvent.click(within(overview).getByRole("button", { name: /^Unconfirmed/ }));
        expect(screen.getByRole("tab", { name: /^Unconfirmed/ })).toHaveAttribute("aria-selected", "true");
        expect(within(overview).queryByRole("button", { name: /^Confirmed/ })).not.toBeInTheDocument();
    });

    it("leads each row with the amount, status, and how much was received, then Venmo, customer, items, and date, with counts on the filters", async () => {
        mockApi({ [PENDING]: listed([order({ amountReceivedCents: 5000 })]) });
        renderPage();

        const row = await findRow();
        expect(within(row).getAllByRole("cell").map((cell) => cell.textContent).slice(1, 6)).toEqual([
            "$72.00Unconfirmed$50.00 of $72.00 received$22.00 left",
            "@example-student",
            "Example Student",
            "Hoodie, Tote Bag ×2",
            "Feb 27, 9:30 AM",
        ]);
        expect(await screen.findByRole("tab", { name: "Unconfirmed 7" })).toHaveAttribute("aria-selected", "true");
        expect(screen.getByRole("tab", { name: "Balance remaining 1" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Follow-up 2" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Ready for pickup 1" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Picked up 2" })).toBeInTheDocument();
        expect(screen.queryByRole("tab", { name: /^Paid/ })).not.toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Dropped 2" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Refunded 1" })).toBeInTheDocument();
    });

    it("still lists orders when the counts can't load", async () => {
        mockApi({ [PENDING]: listed([order()]), [COUNTS]: response({ status: "error" }, 500) });
        renderPage();

        await findRow();
        expect(screen.getByRole("tab", { name: "Unconfirmed" })).toBeInTheDocument();
        expect(screen.queryByRole("group", { name: "Overview" })).not.toBeInTheDocument();
    });

    it("splits paid orders into ready for pickup and picked up, asking the server for each", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([]),
            [`GET ${LIST}?status=paid&followUp=all&pickup=picked_up`]: listed([]),
        });
        renderPage();

        fireEvent.click(await screen.findByRole("tab", { name: /^Ready for pickup/ }));
        expect(await screen.findByText("No paid orders are waiting for pickup.")).toBeInTheDocument();
        expect(requestedUrls(fetchSpy)).toContain(`${LIST}?status=paid&followUp=all&pickup=ready`);

        fireEvent.click(screen.getByRole("tab", { name: /^Picked up/ }));
        expect(await screen.findByText("No orders have been picked up yet.")).toBeInTheDocument();
        expect(requestedUrls(fetchSpy)).toContain(`${LIST}?status=paid&followUp=all&pickup=picked_up`);
    });

    it("asks the server for orders with a balance remaining and for open follow-ups in every status", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}?status=all&followUp=all&balance=short`]: listed([otherOrder({ amountReceivedCents: 1000 })]),
            [`GET ${LIST}?status=all&followUp=awaiting`]: listed([]),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("tab", { name: /^Balance remaining/ }));
        await findRow("Marco Reyes");

        fireEvent.click(screen.getByRole("tab", { name: /^Follow-up/ }));
        expect(await screen.findByText("No orders have an open follow-up.")).toBeInTheDocument();
        expect(requestedUrls(fetchSpy)).toContain(`${LIST}?status=all&followUp=awaiting`);
    });

    it("searches within the chosen filter on the server as the officer types, then across all orders", async () => {
        const paidBuyer = { id: "b2", name: "Paid Buyer", email: "paid@uw.edu" };
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([order({ status: "paid", buyer: paidBuyer })]),
            [`GET ${LIST}?status=pending&followUp=all&q=Paid+Buyer`]: listed([]),
            [`GET ${LIST}?status=all&followUp=all&q=Paid+Buyer`]: listed([order({ status: "paid", buyer: paidBuyer })]),
        });
        renderPage();
        await findRow();

        fireEvent.change(screen.getByLabelText("Search by Venmo, name, or email"), { target: { value: " Paid Buyer " } });
        expect(await screen.findByText("No orders match “Paid Buyer” in Unconfirmed.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Search" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Search all orders" }));
        await findRow("Paid Buyer");
        expect(requestedUrls(fetchSpy)).toContain(`${LIST}?status=all&followUp=all&q=Paid+Buyer`);
    });

    it("explains an empty pending list", async () => {
        mockApi({ [PENDING]: listed([]) });
        renderPage();

        expect(await screen.findByText("No unconfirmed orders. New orders appear here after students confirm checkout.")).toBeInTheDocument();
    });

    it("loads more orders after the current ones", async () => {
        mockApi({
            [PENDING]: listed([order()], "page-2"),
            [`GET ${LIST}?status=pending&followUp=all&cursor=page-2`]: listed([otherOrder()]),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("button", { name: "Load more orders" }));

        await findRow("Marco Reyes");
        expect(await findRow()).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Load more orders" })).not.toBeInTheDocument();
    });

    it("does not leave the new filter stuck loading after an older page answers late", async () => {
        let finishPendingPage;
        let finishPaidFirstPage;
        let finishPaidPage;
        const fetchSpy = mockApi({
            [PENDING]: listed([order()], "pending-page-2"),
            [`GET ${LIST}?status=pending&followUp=all&cursor=pending-page-2`]: () =>
                new Promise((resolve) => { finishPendingPage = resolve; }),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: () =>
                new Promise((resolve) => { finishPaidFirstPage = resolve; }),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready&cursor=paid-page-2`]: () =>
                new Promise((resolve) => { finishPaidPage = resolve; }),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("button", { name: "Load more orders" }));
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));

        expect(screen.getByRole("button", { name: "Example Student" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Load more orders" })).not.toBeInTheDocument();
        expect(requestedUrls(fetchSpy)).not.toContain(`${LIST}?status=paid&followUp=all&pickup=ready&cursor=pending-page-2`);

        await act(async () => finishPaidFirstPage(listed([otherOrder({ status: "paid" })], "paid-page-2")));
        await findRow("Marco Reyes");
        const loadMore = screen.getByRole("button", { name: "Load more orders" });
        expect(loadMore).toBeEnabled();
        fireEvent.click(loadMore);
        expect(requestedUrls(fetchSpy)).toContain(`${LIST}?status=paid&followUp=all&pickup=ready&cursor=paid-page-2`);

        await act(async () => finishPendingPage(listed([order({
            id: "64b0000000000000000000dd",
            buyer: { id: "stale-buyer", name: "Stale pending page", email: "stale@uw.edu" },
        })])));

        expect(screen.getByRole("button", { name: "Loading…" })).toBeDisabled();
        expect(screen.queryByRole("button", { name: "Stale pending page" })).not.toBeInTheDocument();
        await act(async () => finishPaidPage(listed([order({
            id: "64b0000000000000000000cc",
            buyer: { id: "paid-page-buyer", name: "Paid page order", email: "paid-page@uw.edu" },
        })])));
        expect(await findRow("Paid page order")).toBeInTheDocument();
    });

    it("never sends the previous filter's cursor when Load more is used during a filter switch", async () => {
        let finishOldLoadMore;
        let finishPaidFirstPage;
        const fetchSpy = mockApi({
            [PENDING]: listed([order()], "pending-page-2"),
            [`GET ${LIST}?status=pending&followUp=all&cursor=pending-page-2`]: () =>
                new Promise((resolve) => { finishOldLoadMore = resolve; }),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: () =>
                new Promise((resolve) => { finishPaidFirstPage = resolve; }),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready&cursor=paid-page-2`]: listed([otherOrder({ status: "paid" })]),
        });
        renderPage();
        await findRow();
        fireEvent.click(screen.getByRole("button", { name: "Load more orders" }));
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));

        const staleLoadMore = screen.queryByRole("button", { name: /Load more orders|Loading…/ });
        expect(staleLoadMore).not.toBeInTheDocument();
        expect(requestedUrls(fetchSpy).filter((url) => url.includes("cursor=pending-page-2"))).toHaveLength(1);

        await act(async () => finishPaidFirstPage(listed([otherOrder({ status: "paid" })], "paid-page-2")));
        await findRow("Marco Reyes");
        fireEvent.click(screen.getByRole("button", { name: "Load more orders" }));
        expect(await findRow("Marco Reyes")).toBeInTheDocument();
        expect(requestedUrls(fetchSpy).filter((url) => url.includes("cursor=pending-page-2"))).toHaveLength(1);
        expect(requestedUrls(fetchSpy)).toContain(`${LIST}?status=paid&followUp=all&pickup=ready&cursor=paid-page-2`);
        await act(async () => finishOldLoadMore(listed([order({ id: "64b0000000000000000000dd", buyer: { id: "stale", name: "Stale pending page", email: "stale@uw.edu" } })])));
        expect(screen.queryByRole("button", { name: "Stale pending page" })).not.toBeInTheDocument();
    });

    it("keeps the current orders on screen while the next filter loads, and cancels the request it replaces", async () => {
        let pendingRequest;
        mockApi({
            [PENDING]: (options) => {
                pendingRequest = options;
                return listed([order()]);
            },
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: () => new Promise(() => {}),
            [`GET ${LIST}?status=refunded&followUp=all`]: () => new Promise(() => {}),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        const paidRequest = globalThis.fetch.mock.calls.at(-1)[1];

        expect(screen.getByRole("button", { name: "Example Student" })).toBeInTheDocument();
        expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-busy", "true");
        expect(pendingRequest.signal.aborted).toBe(false);
        fireEvent.click(screen.getByRole("tab", { name: /^Refunded/ }));
        expect(paidRequest.signal.aborted).toBe(true);
    });

    it("shows a filter viewed moments ago at once while refreshing it", async () => {
        let pendingAnswers = 0;
        const fetchSpy = mockApi({
            [PENDING]: () => (++pendingAnswers === 1 ? listed([order()], "pending-page-2") : new Promise(() => {})),
            [`GET ${LIST}?status=pending&followUp=all&cursor=pending-page-2`]: listed([otherOrder()]),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([otherOrder({ status: "paid" })]),
        });
        renderPage();
        await findRow();
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        await findRow("Marco Reyes");

        fireEvent.click(screen.getByRole("tab", { name: /^Unconfirmed/ }));

        expect(screen.getByRole("button", { name: "Example Student" })).toBeInTheDocument();
        expect(pendingAnswers).toBe(2);
        const loadMore = screen.getByRole("button", { name: "Load more orders" });
        expect(loadMore).toBeEnabled();
        fireEvent.click(loadMore);
        await findRow("Marco Reyes");
        expect(requestedUrls(fetchSpy)).toContain(`${LIST}?status=pending&followUp=all&cursor=pending-page-2`);
    });

    it("forgets remembered filters once a change is saved, so an outdated order is never shown", async () => {
        let pendingAnswers = 0;
        mockApi({
            [PENDING]: () => (++pendingAnswers === 1 ? listed([order()]) : new Promise(() => {})),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4 })),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([otherOrder({ status: "paid" })]),
        });
        renderPage();
        fireEvent.click(within(await findRow()).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));
        await expectAnnounced("Marked paid: Example Student, $72.00");
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        await findRow("Marco Reyes");

        fireEvent.click(screen.getByRole("tab", { name: /^Unconfirmed/ }));

        expect(screen.queryByRole("button", { name: "Example Student" })).not.toBeInTheDocument();
        expect(pendingAnswers).toBe(2);
    });

    it("shows only the latest filter's results when an earlier request answers late", async () => {
        let answerPending;
        mockApi({
            [PENDING]: () => new Promise((resolve) => { answerPending = resolve; }),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([otherOrder({ status: "paid" })]),
        });
        renderPage();

        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        await findRow("Marco Reyes");
        await act(async () => answerPending(listed([order()])));

        expect(screen.queryByText("Example Student")).not.toBeInTheDocument();
    });

    it("shows no order details to a signed-in user without access", async () => {
        mockApi({
            [PENDING]: response({ status: "error", message: "Not authorized" }, 403),
            [COUNTS]: response({ status: "error", message: "Not authorized" }, 403),
        });
        renderPage();

        expect(await screen.findByText("This page is for IUGA officers who review shop orders.")).toBeInTheDocument();
        expect(screen.queryByRole("table")).not.toBeInTheDocument();
        expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    });

    it("asks a signed-out visitor to sign in without requesting orders", async () => {
        auth.isAuthenticated = false;
        const fetchSpy = mockApi({});
        renderPage();

        fireEvent.click(screen.getByRole("button", { name: "Sign in with UW NetID" }));

        expect(auth.signIn).toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("clears loaded orders and the drawer when the officer signs out", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()) });
        const { rerender } = renderPage();
        await openContact(await openDrawer());
        expect(screen.getByText("(206) 555-0100")).toBeInTheDocument();

        auth.isAuthenticated = false;
        rerender(<MemoryRouter initialEntries={["/admin/shop/orders"]}><ShopOrdersPage /></MemoryRouter>);

        expect(screen.queryByText("Example Student")).not.toBeInTheDocument();
        expect(screen.queryByText("(206) 555-0100")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sign in with UW NetID" })).toBeInTheDocument();
    });
});

describe("order drawer and contact", () => {
    it("shows the amount, what was expected and received, every product, and reference details", async () => {
        mockApi({ [PENDING]: listed([order({ amountReceivedCents: 5000 })]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed({ amountReceivedCents: 5000 })) });
        renderPage();

        const drawer = await openDrawer();

        expect(screen.getByRole("dialog", { name: "Order ...00ff" })).toBe(drawer);
        expect(drawer).toHaveTextContent("$72.00Unconfirmedfrom @example-student");
        expect(within(drawer).getByRole("group", { name: "Payment" })).toHaveTextContent("Expected$72.00Received$50.00EditRemaining$22.00");
        const rows = within(drawer).getAllByRole("row").slice(1).map((row) => row.textContent);
        expect(rows).toEqual(["Hoodie1$32.00$32.00", "Tote Bag2$20.00$40.00", "Total$72.00"]);
        expect(within(drawer).getByRole("group", { name: "Details" })).toHaveTextContent(
            "Venmo@example-studentCustomerExample StudentOrder...00ffConfirmedFeb 27, 9:30 AM",
        );
        expect(within(drawer).queryByText("(206) 555-0100")).not.toBeInTheDocument();
    });

    it("says no payment has been recorded yet, rather than that none was received", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()) });
        renderPage();

        expect(within(await findRow()).getByText("Not recorded")).toBeInTheDocument();
        const drawer = await openDrawer();
        expect(within(drawer).getByRole("group", { name: "Payment" })).toHaveTextContent("Expected$72.00ReceivedNot recordedEnterRemaining$72.00");
    });

    it("shows what was bought by product and price, combining sizes, since sizes don't change what is owed", async () => {
        const lines = [
            { sku: "info-hoodie", name: "Hoodie", size: "M", quantity: 1, unitPriceCents: 3200, lineTotalCents: 3200 },
            { sku: "info-hoodie", name: "Hoodie", size: "L", quantity: 2, unitPriceCents: 3200, lineTotalCents: 6400 },
        ];
        const bought = { lines, totalCents: 9600 };
        mockApi({ [PENDING]: listed([order(bought)]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(bought)) });
        renderPage();

        expect(within(await findRow()).getByText("Hoodie ×3")).toBeInTheDocument();
        const drawer = await openDrawer();
        const rows = within(drawer).getAllByRole("row").slice(1).map((row) => row.textContent);
        expect(rows).toEqual(["Hoodie3$32.00$96.00", "Total$96.00"]);
        expect(drawer).not.toHaveTextContent("(M)");
    });

    it("closes from the close button and returns focus to the order's customer button", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()) });
        renderPage();
        const drawer = await openDrawer();

        fireEvent.click(within(drawer).getByRole("button", { name: "Close order details" }));

        expect(screen.queryByRole("dialog", { name: /^Order / })).not.toBeInTheDocument();
        expect(within(await findRow()).getByRole("button", { name: "Example Student" })).toHaveFocus();
    });

    it("stops the page behind from scrolling while the drawer is open, and lets it scroll again after", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()) });
        renderPage();
        const page = document.body;
        const drawer = await openDrawer();

        expect(page.style.overflow).toBe("hidden");

        fireEvent.click(within(drawer).getByRole("button", { name: "Close order details" }));

        expect(page.style.overflow).toBe("");
    });

    it("returns focus to the customer button however the drawer closes, such as Escape", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()) });
        renderPage();
        fireEvent.click(within(await findRow()).getByText("$72.00"));
        const drawer = screen.getByRole("dialog", { name: /^Order / });

        // Escape on a modal dialog ends in the browser closing it; jsdom only provides close().
        act(() => drawer.close());

        expect(within(await findRow()).getByRole("button", { name: "Example Student" })).toHaveFocus();
    });

    it("shows the buyer's email and phone with a call link and no copy buttons", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()) });
        renderPage();
        const drawer = await openDrawer();

        const contact = await openContact(drawer);
        expect(within(drawer).getByRole("button", { name: "Contact" })).toHaveAttribute("aria-expanded", "true");
        expect(contact).toHaveTextContent("example@uw.edu");
        expect(within(contact).getByText("(206) 555-0100")).toBeInTheDocument();
        expect(within(contact).getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:2065550100");
        expect(within(contact).queryByRole("button", { name: /^copy/i })).not.toBeInTheDocument();
    });

    it("closes the contact dropdown with Escape without closing the drawer, and returns focus to its button", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()) });
        renderPage();
        const drawer = await openDrawer();
        const contact = await openContact(drawer);

        const escape = fireEvent.keyDown(contact, { key: "Escape" });

        expect(escape).toBe(false);
        expect(within(drawer).queryByRole("region", { name: "Contact details" })).not.toBeInTheDocument();
        expect(within(drawer).getByRole("button", { name: "Contact" })).toHaveFocus();
    });

    it("says when the buyer's account is gone and offers no contact", async () => {
        mockApi({ [PENDING]: listed([order({ buyer: null })]), [`GET ${LIST}/${ORDER_ID}`]: saved(order({ buyer: null })) });
        renderPage();

        const drawer = await openDrawer("Account unavailable");

        expect(within(drawer).getByRole("button", { name: "Contact" })).toBeDisabled();
        expect(within(drawer).getByText("This student's account no longer exists, so there is no contact information.")).toBeInTheDocument();
        expect(within(within(drawer).getByRole("list", { name: "Activity" })).getByRole("listitem")).toHaveTextContent(/^Order confirmed/);
    });

    it("says when the buyer has no phone number on file", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed({ buyer: { phone: null } })) });
        renderPage();

        const contact = await openContact(await openDrawer());

        expect(within(contact).getByText("No phone number on file")).toBeInTheDocument();
        expect(within(contact).queryByRole("link", { name: "Call" })).not.toBeInTheDocument();
    });

    it("opens an email draft without recording anything until the officer says it was sent", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()),
            [`PATCH ${LIST}/${ORDER_ID}/follow-up`]: saved(detailed({
                revision: 4,
                followUp: { status: "contacted", updatedBy: "Olive Officer", updatedAt: "2030-02-28T17:00:00.000Z" },
            })),
        });
        renderPage();
        const drawer = await openDrawer();

        fireEvent.click(within(await openContact(drawer)).getByRole("button", { name: "Write email" }));
        const gmail = screen.getByRole("link", { name: "Open in Gmail" });
        expect(decodeURIComponent(gmail.getAttribute("href"))).toContain("$72.00");
        gmail.addEventListener("click", (event) => event.preventDefault(), { once: true });
        fireEvent.click(gmail);
        expect(writes(fetchSpy)).toEqual([]);

        fireEvent.click(screen.getByRole("button", { name: "Yes, mark as contacted" }));

        expect(await within(drawer).findByText("Contacted · Feb 28, 9:00 AM by Olive Officer")).toBeInTheDocument();
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/follow-up`, body: { followUpStatus: "contacted", expectedRevision: 3 } }]);
    });

    it("names the shortfall in the email draft for a short payment", async () => {
        const short = { amountReceivedCents: 5000 };
        mockApi({ [PENDING]: listed([order(short)]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(short)) });
        renderPage();
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        const body = new URL(screen.getByRole("link", { name: "Open in Gmail" }).getAttribute("href")).searchParams.get("body");
        expect(body).toContain("We received $50.00 of the $72.00 for this order, so $22.00 is still owed.");
    });

    it("keeps the payment reminder as the only email for an unconfirmed order with no says-paid follow-up or overpayment", async () => {
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()) });
        renderPage();
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        expect(screen.queryByRole("combobox", { name: "Template" })).not.toBeInTheDocument();
        expect(gmailDraft("su")).toBe("Your IUGA order ...00ff");
        expect(gmailDraft("body")).toBe([
            "Hi Example,",
            "",
            "This is IUGA about your merchandise order ...00ff, confirmed Feb 27, 9:30 AM.",
            "",
            "Items:",
            "- 1 × Hoodie, size M",
            "- 2 × Tote Bag, size One Size",
            "",
            "Expected Venmo payment: $72.00 from @example-student",
            "",
            "We haven't matched this payment in IUGA's Venmo yet. Could you reply with when you sent it, or send it if you haven't yet?",
            "",
            "Thanks,",
            "[Your name]",
            "IUGA",
        ].join("\n"));
    });

    const GENERAL_MESSAGE_BODY = [
        "Hi Example,",
        "",
        "This is IUGA about your merchandise order ...00ff, confirmed Feb 27, 9:30 AM.",
        "",
        "Items:",
        "- 1 × Hoodie, size M",
        "- 2 × Tote Bag, size One Size",
        "",
        "[Write your message here]",
        "",
        "Thanks,",
        "[Your name]",
        "IUGA",
    ].join("\n");

    it("offers a general message with no payment request on a paid order, and no follow-up to confirm", async () => {
        const paid = { status: "paid", amountReceivedCents: 7200, followUp: { status: "says_paid", updatedBy: "Olive Officer", updatedAt: "2030-02-28T17:00:00.000Z" } };
        mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([order(paid)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(paid)),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        expect(screen.queryByRole("option", { name: "Payment reminder" })).not.toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "Can't find their payment" })).not.toBeInTheDocument();
        expect(gmailDraft("body")).toBe(GENERAL_MESSAGE_BODY);

        openInGmail();
        expect(screen.queryByRole("heading", { name: "Did you send the email?" })).not.toBeInTheDocument();
    });

    it("offers a general message with no payment request on a refunded order", async () => {
        const refunded = { status: "refunded", amountReceivedCents: 7200 };
        mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=refunded&followUp=all`]: listed([order(refunded)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(refunded)),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Refunded/ }));
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        expect(screen.queryByRole("option", { name: "Payment reminder" })).not.toBeInTheDocument();
        expect(gmailDraft("body")).toBe(GENERAL_MESSAGE_BODY);
    });

    it("offers paid too much before the general message on a paid order that was overpaid", async () => {
        const overpaid = { status: "paid", amountReceivedCents: 8000 };
        mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([order(overpaid)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(overpaid)),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        const options = screen.getAllByRole("option").map((option) => option.textContent);
        expect(options).toEqual(["Paid too much", "General message"]);
        expect(screen.getByRole("combobox", { name: "Template" })).toHaveDisplayValue("Paid too much");

        fireEvent.change(screen.getByRole("combobox", { name: "Template" }), { target: { value: "general" } });
        expect(gmailDraft("body")).toBe(GENERAL_MESSAGE_BODY);
    });

    it("keeps the can't-find-payment email first on a dropped order that the student says they paid", async () => {
        const droppedSaysPaid = { status: "not_paid", followUp: { status: "says_paid", updatedBy: "Olive Officer", updatedAt: "2030-02-28T17:00:00.000Z" } };
        mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=not_paid&followUp=all`]: listed([order(droppedSaysPaid)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(droppedSaysPaid)),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Dropped/ }));
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["Can't find their payment", "Payment reminder"]);
    });

    it("offers the can't-find-payment email first when the student said they paid, naming the total and Venmo name", async () => {
        const saysPaid = { followUp: { status: "says_paid", updatedBy: "Olive Officer", updatedAt: "2030-02-28T17:00:00.000Z" } };
        mockApi({ [PENDING]: listed([order(saysPaid)]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(saysPaid)) });
        renderPage();
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        expect(screen.getByRole("combobox", { name: "Template" })).toHaveDisplayValue("Can't find their payment");
        expect(screen.getByRole("option", { name: "Payment reminder" })).toBeInTheDocument();
        expect(gmailDraft("su")).toBe("Your IUGA order ...00ff: finding your Venmo payment");
        expect(gmailDraft("body")).toContain(
            "You let us know you already paid, but we haven't found a payment of $72.00 from @example-student in IUGA's Venmo yet.\n\nCould you reply with the date and time you sent it and the Venmo username you sent it from? A screenshot of the payment also helps.",
        );
    });

    it("sends the can't-find-payment email without asking whether it was sent", async () => {
        const saysPaid = { followUp: { status: "says_paid", updatedBy: "Olive Officer", updatedAt: "2030-02-28T17:00:00.000Z" } };
        mockApi({ [PENDING]: listed([order(saysPaid)]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(saysPaid)) });
        renderPage();
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        openInGmail();

        expect(screen.queryByText("Did you send the email?")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Open in Outlook" })).toBeInTheDocument();
    });

    it("defaults an overpaid order to the paid-too-much email, naming the difference", async () => {
        const overpaid = { status: "paid", amountReceivedCents: 8000 };
        mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([order(overpaid)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(overpaid)),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        expect(screen.getByRole("combobox", { name: "Template" })).toHaveDisplayValue("Paid too much");
        expect(gmailDraft("su")).toBe("Your IUGA order ...00ff: extra payment");
        expect(gmailDraft("body")).toContain(
            "We received $80.00 for this order, which is $8.00 more than the $72.00 total. We're returning the extra $8.00 to @example-student on Venmo.\n\nReply if you have any questions.",
        );
    });

    it("switches to the payment reminder, which still asks whether it was sent before the student is marked contacted", async () => {
        const saysPaid = { followUp: { status: "says_paid", updatedBy: "Olive Officer", updatedAt: "2030-02-28T17:00:00.000Z" } };
        const fetchSpy = mockApi({
            [PENDING]: listed([order(saysPaid)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(saysPaid)),
            [`PATCH ${LIST}/${ORDER_ID}/follow-up`]: saved(detailed({
                revision: 4,
                followUp: { status: "contacted", updatedBy: "Olive Officer", updatedAt: "2030-02-28T17:00:00.000Z" },
            })),
        });
        renderPage();
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));
        fireEvent.change(screen.getByRole("combobox", { name: "Template" }), { target: { value: "reminder" } });

        openInGmail();
        expect(screen.getByRole("heading", { name: "Did you send the email?" })).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Yes, mark as contacted" }));

        await expectAnnounced("Logged follow-up: Example Student");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/follow-up`, body: { followUpStatus: "contacted", expectedRevision: 3 } }]);
    });

    it("keeps Write email in view but disabled when the student has no email address", async () => {
        const noEmail = { buyer: { id: "64b0000000000000000000bb", name: "Example Student", email: null } };
        mockApi({ [PENDING]: listed([order(noEmail)]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(noEmail)) });
        renderPage();

        const contact = await openContact(await openDrawer());

        expect(within(contact).getByText("No email on file")).toBeInTheDocument();
        expect(within(contact).getByRole("button", { name: "Write email" })).toBeDisabled();
    });

    it("logs what the student said with a note, and shows it on the order and in its activity", async () => {
        const note = "Said she'll send it Friday.";
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()),
            [`PATCH ${LIST}/${ORDER_ID}/follow-up`]: saved(detailed({
                revision: 4,
                followUp: { status: "will_pay", updatedBy: "Olive Officer", updatedAt: "2030-02-28T17:00:00.000Z" },
                history: [{ actor: "Olive Officer", at: "2030-02-28T17:00:00.000Z", kind: "follow_up", from: "none", to: "will_pay", note }],
            })),
        });
        renderPage();
        const drawer = await openDrawer();

        fireEvent.click(within(drawer).getByRole("button", { name: "Add to log" }));
        const dialog = confirmDialog("Log follow-up for Example Student");
        expect(within(dialog).queryByRole("radio", { name: "Clear follow-up" })).not.toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
        fireEvent.click(within(dialog).getByRole("radio", { name: "Student said they will pay" }));
        fireEvent.change(within(dialog).getByLabelText("Note (optional)"), { target: { value: note } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

        await expectAnnounced("Logged follow-up: Example Student");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/follow-up`, body: { followUpStatus: "will_pay", note, expectedRevision: 3 } }]);
        expect(within(drawer).getByText("Will pay · Feb 28, 9:00 AM by Olive Officer")).toBeInTheDocument();
        expect(within(drawer).getByRole("list", { name: "Activity" })).toHaveTextContent(`Olive Officer noted the student will pay“${note}”`);
        expect(within(await findRow()).getByText("Will pay")).toBeInTheDocument();
    });

    it("adds an entry on any other topic, which needs a topic and keeps the follow-up as it was", async () => {
        const entry = { actor: "Olive Officer", at: "2030-02-28T17:00:00.000Z", kind: "note", title: "Venmo name changed", note: "Now pays from @priya-r." };
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()),
            [`POST ${LIST}/${ORDER_ID}/notes`]: saved(detailed({ revision: 4, history: [entry] })),
        });
        renderPage();
        const drawer = await openDrawer();

        fireEvent.click(within(drawer).getByRole("button", { name: "Add to log" }));
        const dialog = confirmDialog("Log follow-up for Example Student");
        fireEvent.click(within(dialog).getByRole("radio", { name: "Other" }));
        fireEvent.change(within(dialog).getByLabelText("Topic"), { target: { value: "   " } });
        expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Topic"), { target: { value: " Venmo name changed " } });
        fireEvent.change(within(dialog).getByLabelText("Description (optional)"), { target: { value: "Now pays from @priya-r." } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

        await expectAnnounced("Added to log: Example Student");
        const posted = fetchSpy.mock.calls.filter(([, options = {}]) => options.method === "POST");
        expect(posted.map(([url, options]) => ({ url, body: JSON.parse(options.body) }))).toEqual([
            { url: `${LIST}/${ORDER_ID}/notes`, body: { title: "Venmo name changed", note: "Now pays from @priya-r.", expectedRevision: 3 } },
        ]);
        expect(writes(fetchSpy)).toEqual([]);
        expect(within(drawer).getByRole("list", { name: "Activity" })).toHaveTextContent("Olive Officer · Venmo name changed“Now pays from @priya-r.”");
    });

    it("offers to clear an open follow-up", async () => {
        const open = { followUp: { status: "says_paid", updatedBy: "Olive Officer", updatedAt: "2030-02-28T17:00:00.000Z" } };
        const fetchSpy = mockApi({
            [PENDING]: listed([order(open)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(open)),
            [`PATCH ${LIST}/${ORDER_ID}/follow-up`]: saved(detailed({ revision: 4 })),
        });
        renderPage();
        expect(within(await findRow()).getAllByRole("cell")[1]).toHaveTextContent("$72.00UnconfirmedSays paidFeb 28");
        const drawer = await openDrawer();

        fireEvent.click(within(drawer).getByRole("button", { name: "Add to log" }));
        const dialog = confirmDialog("Log follow-up for Example Student");
        fireEvent.click(within(dialog).getByRole("radio", { name: "Clear follow-up" }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

        await expectAnnounced("Cleared follow-up: Example Student");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/follow-up`, body: { followUpStatus: "none", expectedRevision: 3 } }]);
    });

    it("moves through the actions menu with arrow keys and closes it with Escape on its button", async () => {
        mockApi({ [PENDING]: listed([order()]) });
        renderPage();
        const row = await findRow();
        const trigger = within(row).getByRole("button", { name: "More actions for Example Student's order" });

        fireEvent.click(trigger);
        const items = within(screen.getByRole("menu", { name: "Order actions" })).getAllByRole("menuitem");
        expect(items.map((item) => item.textContent)).toEqual(["Enter amount received", "Change status…", "Drop unconfirmed order"]);
        expect(items[0]).toHaveFocus();
        fireEvent.keyDown(items[0], { key: "ArrowUp" });
        expect(items[2]).toHaveFocus();
        fireEvent.keyDown(items[2], { key: "ArrowDown" });
        expect(items[0]).toHaveFocus();

        expect(fireEvent.keyDown(items[0], { key: "Escape" })).toBe(false);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
    });

    it("shows the order's activity in plain words", async () => {
        const history = [
            { actor: "Olive Officer", at: "2030-02-28T17:00:00.000Z", kind: "amount_received", from: "none", to: "5000" },
            { actor: "Olive Officer", at: "2030-02-28T18:00:00.000Z", kind: "amount_received", from: "5000", to: "7200" },
            { actor: "Olive Officer", at: "2030-02-28T18:00:00.000Z", kind: "payment", from: "pending", to: "paid" },
        ];
        mockApi({ [PENDING]: listed([order({ history })]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed({ history })) });
        renderPage();

        const activity = within(await openDrawer()).getByRole("list", { name: "Activity" });

        expect(within(activity).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
            "Olive Officer changed payment from Unconfirmed to PaidFeb 28, 10:00 AM",
            "Olive Officer changed the amount received from $50.00 to $72.00Feb 28, 10:00 AM",
            "Olive Officer recorded $50.00 receivedFeb 28, 9:00 AM",
            "Example Student confirmed the orderFeb 27, 9:30 AM",
        ]);
    });
});

describe("marking orders paid", () => {
    it("confirms in a dialog before marking paid, and Cancel sends nothing and returns focus", async () => {
        const fetchSpy = mockApi({ [PENDING]: listed([order()]) });
        renderPage();
        const row = await findRow();

        fireEvent.click(within(row).getByRole("button", { name: "Mark paid" }));
        const dialog = confirmDialog("Mark $72.00 as paid?");
        expect(dialog).toHaveTextContent("Only do this after finding the payment from @example-student in IUGA's Venmo. If this was a mistake, you can change its status from the order.");
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

        expect(writes(fetchSpy)).toEqual([]);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(within(row).getByRole("button", { name: "Mark paid" })).toHaveFocus();
    });

    it("marks an order paid from its row, announces it, and refreshes the counts", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 })),
        });
        renderPage();
        const row = await findRow();

        fireEvent.click(within(row).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));

        await expectAnnounced("Marked paid: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "paid", expectedRevision: 3 } }]);
        expect(screen.queryByRole("button", { name: "Example Student" })).not.toBeInTheDocument();
        await waitFor(() => expect(requestedUrls(fetchSpy).filter((url) => url === `${LIST}/counts`)).toHaveLength(2));
    });

    it("marks an order paid from its drawer after the same confirmation", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 })),
        });
        renderPage();
        const drawer = await openDrawer();

        fireEvent.click(within(drawer).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));

        await expectAnnounced("Marked paid: Example Student, $72.00");
        expect(await within(drawer).findByText("Paid")).toBeInTheDocument();
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "paid", expectedRevision: 3 } }]);
    });

    it("marks several selected orders paid after one confirmation, keeping each order's revision", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order(), otherOrder()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4 })),
            [`PATCH ${LIST}/${OTHER_ID}/payment`]: saved(otherOrder({ status: "paid", revision: 1 })),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("checkbox", { name: "Select Example Student's order" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Marco Reyes's order" }));
        const bar = screen.getByRole("region", { name: "Selected orders" });
        expect(bar).toHaveTextContent("2 selected$92.00 total");
        fireEvent.click(within(bar).getByRole("button", { name: "Mark 2 paid" }));
        const dialog = confirmDialog("Mark 2 orders paid?");
        expect(dialog).toHaveTextContent("$92.00 in total. Only do this after finding every payment in IUGA's Venmo.");
        expect(writes(fetchSpy)).toEqual([]);
        fireEvent.click(within(dialog).getByRole("button", { name: "Mark 2 paid" }));

        await expectAnnounced("Marked 2 orders paid.");
        expect(writes(fetchSpy)).toEqual([
            { url: `${LIST}/${ORDER_ID}/payment`, body: { status: "paid", expectedRevision: 3 } },
            { url: `${LIST}/${OTHER_ID}/payment`, body: { status: "paid", expectedRevision: 0 } },
        ]);
        expect(screen.queryByRole("region", { name: "Selected orders" })).not.toBeInTheDocument();
    });

    it("drops a selected order from the selection once it can no longer be marked paid", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=all&followUp=all`]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "refunded", revision: 4 })),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
        const row = await findRow();
        fireEvent.click(within(row).getByRole("checkbox", { name: "Select Example Student's order" }));

        chooseAction(row, "More actions for Example Student's order", "Change status…");
        const dialog = screen.getByRole("dialog", { name: "Change status of Example Student's order" });
        fireEvent.click(within(dialog).getByRole("radio", { name: /^Refunded/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: "Move to Refunded" }));
        await expectAnnounced("Refund recorded: Example Student");

        expect(screen.queryByRole("region", { name: "Selected orders" })).not.toBeInTheDocument();
        expect(writes(fetchSpy).filter(({ body }) => body.status === "paid")).toEqual([]);
    });

    it("reports orders as marked paid when the officer changes the filter while they are saving", async () => {
        let finishFirstSave;
        const fetchSpy = mockApi({
            [PENDING]: listed([order(), otherOrder()]),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: () => new Promise((resolve) => { finishFirstSave = resolve; }),
            [`PATCH ${LIST}/${OTHER_ID}/payment`]: saved(otherOrder({ status: "paid", revision: 1 })),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("checkbox", { name: "Select Example Student's order" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Marco Reyes's order" }));
        fireEvent.click(screen.getByRole("button", { name: "Mark 2 paid" }));
        fireEvent.click(within(confirmDialog("Mark 2 orders paid?")).getByRole("button", { name: "Mark 2 paid" }));
        await within(await findRow()).findByRole("button", { name: "Saving…" });
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        await act(async () => finishFirstSave(saved(detailed({ status: "paid", revision: 4 }))));

        await expectAnnounced("Marked 2 orders paid.");
        expect(screen.getByRole("status")).not.toHaveTextContent("Couldn't");
        expect(writes(fetchSpy)).toHaveLength(2);
    });

    it("does not submit a second bulk decision while the first one is still saving", async () => {
        let finishFirstSave;
        let firstOrderCalls = 0;
        const fetchSpy = mockApi({
            [PENDING]: listed([order(), otherOrder()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: () => {
                firstOrderCalls += 1;
                if (firstOrderCalls === 1) return new Promise((resolve) => { finishFirstSave = resolve; });
                return response({ status: "error", message: CONFLICT }, 409);
            },
            [`PATCH ${LIST}/${OTHER_ID}/payment`]: saved(otherOrder({ status: "paid", revision: 1 })),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("checkbox", { name: "Select Example Student's order" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Marco Reyes's order" }));
        fireEvent.click(screen.getByRole("button", { name: "Mark 2 paid" }));
        fireEvent.click(within(confirmDialog("Mark 2 orders paid?")).getByRole("button", { name: "Mark 2 paid" }));
        await within(await findRow()).findByRole("button", { name: "Saving…" });

        const selectionBar = screen.getByRole("region", { name: "Selected orders" });
        const submit = within(selectionBar).getByRole("button", { name: "Saving…" });
        expect(submit).toBeDisabled();
        fireEvent.click(submit);
        expect(screen.queryByRole("dialog", { name: "Mark 2 orders paid?" })).not.toBeInTheDocument();

        const requestsWhileFirstSaveWasPending = firstOrderCalls;
        await act(async () => finishFirstSave(saved(detailed({ status: "paid", revision: 4 }))));
        expect(requestsWhileFirstSaveWasPending).toBe(1);
        expect(writes(fetchSpy).filter(({ url }) => url === `${LIST}/${ORDER_ID}/payment`)).toHaveLength(1);
    });

    it("allows a new bulk attempt after a failed batch", async () => {
        let attempts = 0;
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: () => (++attempts === 1
                ? response({ status: "error", message: "Payment service unavailable." }, 503)
                : saved(detailed({ status: "paid", revision: 4 }))),
        });
        renderPage();
        const row = await findRow();

        fireEvent.click(within(row).getByRole("checkbox", { name: "Select Example Student's order" }));
        fireEvent.click(screen.getByRole("button", { name: "Mark 1 paid" }));
        fireEvent.click(within(confirmDialog("Mark 1 order paid?")).getByRole("button", { name: "Mark 1 paid" }));
        await expectAnnounced("Marked 0 of 1 orders paid. Couldn't mark Example Student's order: Payment service unavailable.");

        fireEvent.click(within(await findRow()).getByRole("checkbox", { name: "Select Example Student's order" }));
        fireEvent.click(screen.getByRole("button", { name: "Mark 1 paid" }));
        fireEvent.click(within(confirmDialog("Mark 1 order paid?")).getByRole("button", { name: "Mark 1 paid" }));

        await expectAnnounced("Marked 1 order paid.");
        expect(attempts).toBe(2);
        expect(writes(fetchSpy)).toEqual([
            { url: `${LIST}/${ORDER_ID}/payment`, body: { status: "paid", expectedRevision: 3 } },
            { url: `${LIST}/${ORDER_ID}/payment`, body: { status: "paid", expectedRevision: 3 } },
        ]);
    });

    it("clears the selection without sending anything", async () => {
        const fetchSpy = mockApi({ [PENDING]: listed([order()]) });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("checkbox", { name: "Select Example Student's order" }));
        fireEvent.click(within(screen.getByRole("region", { name: "Selected orders" })).getByRole("button", { name: "Clear" }));

        expect(screen.queryByRole("region", { name: "Selected orders" })).not.toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: "Select Example Student's order" })).not.toBeChecked();
        expect(writes(fetchSpy)).toEqual([]);
    });

    it("reports which selected orders could not be marked paid", async () => {
        mockApi({
            [PENDING]: listed([order(), otherOrder()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4 })),
            [`PATCH ${LIST}/${OTHER_ID}/payment`]: response({ status: "error", message: CONFLICT }, 409),
            [`GET ${LIST}/${OTHER_ID}`]: saved(otherOrder({ revision: 1 })),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("checkbox", { name: "Select Example Student's order" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Marco Reyes's order" }));
        fireEvent.click(screen.getByRole("button", { name: "Mark 2 paid" }));
        fireEvent.click(within(confirmDialog("Mark 2 orders paid?")).getByRole("button", { name: "Mark 2 paid" }));

        await expectAnnounced("Marked 1 of 2 orders paid. Couldn't mark Marco Reyes's order: Another officer updated this order.");
        expect(within(await findRow("Marco Reyes")).getByRole("alert")).toHaveTextContent("Another officer updated this order.");
    });

    it("lets only orders that can be marked paid be selected", async () => {
        mockApi({ [`GET ${LIST}?status=all&followUp=all`]: listed([order({ status: "paid" }), otherOrder()]), [PENDING]: listed([]) });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
        await findRow();

        expect(screen.queryByRole("checkbox", { name: "Select Example Student's order" })).not.toBeInTheDocument();
        expect(screen.getByRole("checkbox", { name: "Select Marco Reyes's order" })).toBeInTheDocument();
    });

    it("explains the stock effect before dropping, and Cancel sends nothing", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "not_paid", revision: 4 })),
        });
        renderPage();
        const drawer = await openDrawer();

        chooseAction(drawer, "More actions", "Drop unconfirmed order");
        const dialog = confirmDialog("Drop Example Student's $72.00 order?");
        expect(dialog).toHaveTextContent("Hoodie, Tote Bag ×2");
        expect(dialog).toHaveTextContent("This does not refund a Venmo payment.");
        expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
        fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
        expect(writes(fetchSpy)).toEqual([]);
        expect(within(drawer).getByRole("button", { name: "More actions" })).toHaveFocus();

        chooseAction(drawer, "More actions", "Drop unconfirmed order");
        fireEvent.click(within(confirmDialog("Drop Example Student's $72.00 order?")).getByRole("button", { name: "Drop unconfirmed order" }));

        await expectAnnounced("Dropped: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "not_paid", expectedRevision: 3 } }]);
    });

    it("records a refund for a paid order after asking for the Venmo refund first", async () => {
        const paid = { status: "paid", amountReceivedCents: 7200 };
        const fetchSpy = mockApi({
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([order(paid)]),
            [PENDING]: listed([]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(paid)),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ ...paid, status: "refunded", revision: 4 })),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        const drawer = await openDrawer();
        expect(within(drawer).queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();

        expect(within(drawer).queryByRole("button", { name: /amount received/ })).not.toBeInTheDocument();
        fireEvent.click(within(drawer).getByRole("button", { name: "More actions" }));
        const menu = within(drawer).getByRole("menu", { name: "Order actions" });
        expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Change status…", "Record refund"]);
        fireEvent.click(within(menu).getByRole("menuitem", { name: "Record refund" }));
        const dialog = confirmDialog("Record refund for Example Student's $72.00 order?");
        expect(dialog).toHaveTextContent("Send the refund in Venmo first");
        fireEvent.click(within(dialog).getByRole("button", { name: "Record refund" }));

        await expectAnnounced("Refund recorded: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "refunded", expectedRevision: 3 } }]);
    });

    it("shows the latest order after another officer's change, without repeating the decision", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: response({ status: "error", message: CONFLICT }, 409),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed({ status: "paid", revision: 4 })),
        });
        renderPage();
        const row = await findRow();

        fireEvent.click(within(row).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));

        expect(await within(row).findByRole("alert")).toHaveTextContent("Another officer updated this order.");
        expect(await within(row).findByText("Paid")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Mark paid" })).not.toBeInTheDocument();
        expect(writes(fetchSpy)).toHaveLength(1);
        expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("never claims success when the response is lost, and refreshes the order", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: () => Promise.reject(new TypeError("Failed to fetch")),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()),
        });
        renderPage();
        const row = await findRow();

        fireEvent.click(within(row).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));

        expect(await within(row).findByRole("alert")).toHaveTextContent("We couldn't confirm that change. Review the latest details before trying again.");
        await waitFor(() => expect(requestedUrls(fetchSpy)).toContain(`${LIST}/${ORDER_ID}`));
        expect(screen.getByRole("status")).toBeEmptyDOMElement();
        expect(writes(fetchSpy)).toHaveLength(1);
    });

    it("disables the order's actions while a decision is saving", async () => {
        let finish;
        mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: () => new Promise((resolve) => { finish = resolve; }),
        });
        renderPage();
        const row = await findRow();

        fireEvent.click(within(row).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));

        expect(within(row).getByRole("button", { name: "Saving…" })).toBeDisabled();
        expect(within(row).getByRole("button", { name: "More actions for Example Student's order" })).toBeDisabled();
        expect(within(row).getByRole("checkbox")).toBeDisabled();
        await act(async () => finish(saved(detailed({ status: "paid", revision: 4 }))));
    });

    it("explains why a dropped order can't be marked paid when the items no longer fit", async () => {
        mockApi({
            [`GET ${LIST}?status=not_paid&followUp=all`]: listed([order({ status: "not_paid" })]),
            [PENDING]: listed([]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: response({ status: "error", message: "Not enough Hoodie left in this drop to take this order's items again. Nothing changed." }, 409),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed({ status: "not_paid" })),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Dropped/ }));
        const row = await findRow();

        fireEvent.click(within(row).getByRole("button", { name: "Mark paid" }));
        const dialog = confirmDialog("Mark $72.00 as paid?");
        expect(dialog).toHaveTextContent(/only if every item still fits current stock/);
        fireEvent.click(within(dialog).getByRole("button", { name: "Mark paid" }));

        expect(await within(row).findByRole("alert")).toHaveTextContent("Not enough Hoodie left in this drop to take this order's items again. Nothing changed.");
    });
});

describe("result of a single mark paid", () => {
    it("offers Undo after an unconfirmed order is marked paid, and keeps the result in one status area", async () => {
        mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 })),
        });
        renderPage();

        fireEvent.click(within(await findRow()).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));

        await expectAnnounced("Marked paid: Example Student, $72.00");
        expect(screen.getAllByRole("status")).toHaveLength(1);
        expect(screen.getByRole("button", { name: "Undo mark paid for Example Student" })).toBeInTheDocument();
    });

    it("moves the order back to Unconfirmed with the revision it was saved at, then reports that result", async () => {
        let saves = 0;
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: () => (++saves === 1
                ? saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 }))
                : saved(detailed({ status: "pending", revision: 5 }))),
        });
        renderPage();

        fireEvent.click(within(await findRow()).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));
        await expectAnnounced("Marked paid: Example Student, $72.00");
        fireEvent.click(screen.getByRole("button", { name: "Undo mark paid for Example Student" }));

        await expectAnnounced("Moved back to unconfirmed: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([
            { url: `${LIST}/${ORDER_ID}/payment`, body: { status: "paid", expectedRevision: 3 } },
            { url: `${LIST}/${ORDER_ID}/payment`, body: { status: "pending", expectedRevision: 4 } },
        ]);
        expect(screen.queryByRole("button", { name: "Undo mark paid for Example Student" })).not.toBeInTheDocument();
        expect(within(await findRow()).getByRole("button", { name: "Mark paid" })).toBeInTheDocument();
    });

    it("reports the server's message when Undo can't be saved, and offers no second Undo", async () => {
        let saves = 0;
        mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: () => (++saves === 1
                ? saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 }))
                : response({ status: "error", message: CONFLICT }, 409)),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 })),
        });
        renderPage();

        fireEvent.click(within(await findRow()).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));
        await expectAnnounced("Marked paid: Example Student, $72.00");
        fireEvent.click(screen.getByRole("button", { name: "Undo mark paid for Example Student" }));

        await expectAnnounced(CONFLICT);
        expect(screen.queryByRole("button", { name: "Undo mark paid for Example Student" })).not.toBeInTheDocument();
    });

    it("offers no Undo after marking a dropped order paid, since that retakes its items", async () => {
        mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=not_paid&followUp=all`]: listed([order({ status: "not_paid" })]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 })),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Dropped/ }));

        fireEvent.click(within(await findRow()).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));

        await expectAnnounced("Marked paid: Example Student, $72.00");
        expect(screen.queryByRole("button", { name: "Undo mark paid for Example Student" })).not.toBeInTheDocument();
    });

    it("offers no Undo after dropping an order, since Undo would retake its items", async () => {
        mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "not_paid", revision: 4 })),
        });
        renderPage();

        chooseAction(await findRow(), "More actions for Example Student's order", "Drop unconfirmed order");
        fireEvent.click(within(confirmDialog("Drop Example Student's $72.00 order?")).getByRole("button", { name: "Drop unconfirmed order" }));

        await expectAnnounced("Dropped: Example Student, $72.00");
        expect(screen.queryByRole("button", { name: "Undo mark paid for Example Student" })).not.toBeInTheDocument();
    });

    it("drops Undo once a newer result replaces it", async () => {
        mockApi({
            [PENDING]: listed([order(), otherOrder()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 })),
            [`PATCH ${LIST}/${OTHER_ID}/payment`]: saved(otherOrder({ status: "not_paid", revision: 1 })),
        });
        renderPage();

        fireEvent.click(within(await findRow()).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));
        await expectAnnounced("Marked paid: Example Student, $72.00");
        chooseAction(await findRow("Marco Reyes"), "More actions for Marco Reyes's order", "Drop unconfirmed order");
        fireEvent.click(within(confirmDialog("Drop Marco Reyes's $20.00 order?")).getByRole("button", { name: "Drop unconfirmed order" }));

        await expectAnnounced("Dropped: Marco Reyes, $20.00");
        expect(screen.queryByRole("button", { name: "Undo mark paid for Example Student" })).not.toBeInTheDocument();
    });
});

describe("several orders marked paid together", () => {
    it("keeps the selection bar on screen and shows which order is being marked while they save", async () => {
        const finish = [];
        mockApi({
            [PENDING]: listed([order(), otherOrder()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: () => new Promise((resolve) => { finish[0] = resolve; }),
            [`PATCH ${LIST}/${OTHER_ID}/payment`]: () => new Promise((resolve) => { finish[1] = resolve; }),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("checkbox", { name: "Select Example Student's order" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Marco Reyes's order" }));
        fireEvent.click(screen.getByRole("button", { name: "Mark 2 paid" }));
        fireEvent.click(within(confirmDialog("Mark 2 orders paid?")).getByRole("button", { name: "Mark 2 paid" }));

        expect(await screen.findByRole("region", { name: "Selected orders" })).toHaveTextContent("Marking 1 of 2…");
        await act(async () => finish[0](saved(detailed({ status: "paid", revision: 4 }))));
        await waitFor(() => expect(screen.getByRole("region", { name: "Selected orders" })).toHaveTextContent("Marking 2 of 2…"));
        await act(async () => finish[1](saved(otherOrder({ status: "paid", revision: 1 }))));

        await expectAnnounced("Marked 2 orders paid.");
        expect(screen.queryByRole("region", { name: "Selected orders" })).not.toBeInTheDocument();
    });

    it("offers to select only the orders that failed and can still be marked paid", async () => {
        mockApi({
            [PENDING]: listed([order(), otherOrder()]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: response({ status: "error", message: "Payment service unavailable." }, 503),
            [`PATCH ${LIST}/${OTHER_ID}/payment`]: response({ status: "error", message: CONFLICT }, 409),
            [`GET ${LIST}/${OTHER_ID}`]: saved(otherOrder({ status: "refunded", revision: 2 })),
        });
        renderPage();
        await findRow();

        fireEvent.click(screen.getByRole("checkbox", { name: "Select Example Student's order" }));
        fireEvent.click(screen.getByRole("checkbox", { name: "Select Marco Reyes's order" }));
        fireEvent.click(screen.getByRole("button", { name: "Mark 2 paid" }));
        fireEvent.click(within(confirmDialog("Mark 2 orders paid?")).getByRole("button", { name: "Mark 2 paid" }));
        await expectAnnounced("Marked 0 of 2 orders paid.");
        await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Select Marco Reyes's order" })).not.toBeInTheDocument());

        fireEvent.click(screen.getByRole("button", { name: "Select the 1 that failed" }));

        expect(screen.getByRole("region", { name: "Selected orders" })).toHaveTextContent("1 selected");
        expect(screen.getByRole("checkbox", { name: "Select Example Student's order" })).toBeChecked();
    });
});

describe("overview while orders save", () => {
    const REFRESHED_TOTALS = { ...TOTALS, owedCents: 12800 };

    it("keeps the overview on screen while its numbers refresh after a save", async () => {
        let countReads = 0;
        let finishRefresh;
        mockApi({
            [PENDING]: listed([order()]),
            [COUNTS]: () => {
                countReads += 1;
                if (countReads === 1) return response({ status: "success", counts: COUNT_VALUES, totals: TOTALS });
                return new Promise((resolve) => { finishRefresh = resolve; });
            },
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 })),
        });
        renderPage();
        const overview = await screen.findByRole("group", { name: "Overview" });

        fireEvent.click(within(await findRow()).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));
        await expectAnnounced("Marked paid: Example Student, $72.00");
        await waitFor(() => expect(finishRefresh).toBeDefined());

        await act(async () => {});
        expect(screen.getByRole("group", { name: "Overview" })).toHaveTextContent("Unconfirmed$200.00");
        await act(async () => finishRefresh(response({ status: "success", counts: COUNT_VALUES, totals: REFRESHED_TOTALS })));
        await waitFor(() => expect(overview).toHaveTextContent("Unconfirmed$128.00"));
    });

    it("keeps the last numbers when the refresh after a save fails", async () => {
        let countReads = 0;
        mockApi({
            [PENDING]: listed([order()]),
            [COUNTS]: () => {
                countReads += 1;
                if (countReads === 1) return response({ status: "success", counts: COUNT_VALUES, totals: TOTALS });
                return response({ status: "error" }, 500);
            },
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", revision: 4, amountReceivedCents: 7200 })),
        });
        renderPage();

        fireEvent.click(within(await findRow()).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));
        await expectAnnounced("Marked paid: Example Student, $72.00");
        await waitFor(() => expect(countReads).toBe(2));
        await act(async () => {});

        expect(screen.getByRole("group", { name: "Overview" })).toHaveTextContent("Unconfirmed$200.00");
    });
});

describe("correcting an order's status", () => {
    // The first $40.00 was recorded before the rest arrived, so moving the order back restores $40.00.
    const takenInTwo = [
        { actor: "Olive Officer", at: "2030-02-28T17:00:00.000Z", kind: "amount_received", from: "none", to: "4000" },
        { actor: "Olive Officer", at: "2030-02-28T18:00:00.000Z", kind: "amount_received", from: "4000", to: "7200" },
        { actor: "Olive Officer", at: "2030-02-28T18:00:00.000Z", kind: "payment", from: "pending", to: "paid" },
    ];
    const paid = { status: "paid", amountReceivedCents: 7200, amountBeforePaidCents: 4000, history: takenInTwo };

    // Lists the order on the All tab, where it stays whatever its status, and opens its drawer.
    async function openOrderOnAll(listedOrder, routes = {}) {
        const fetchSpy = mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=all&followUp=all`]: listed([order(listedOrder)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(listedOrder)),
            ...routes,
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
        return { fetchSpy, drawer: await openDrawer() };
    }

    // Opens the Change status dialog from the order's status badge, picks a status, and returns the dialog.
    function changeStatus(drawer, label) {
        fireEvent.click(within(drawer).getByRole("button", { name: /^Change status, now / }));
        const dialog = screen.getByRole("dialog", { name: "Change status of Example Student's order" });
        fireEvent.click(within(dialog).getByRole("radio", { name: new RegExp(`^${label}`) }));
        return dialog;
    }

    it("opens the same Change status dialog from the order's ··· menu and from its status badge", async () => {
        const { drawer } = await openOrderOnAll(paid);

        fireEvent.click(within(drawer).getByRole("button", { name: "More actions" }));
        fireEvent.click(within(screen.getByRole("menu", { name: "Order actions" })).getByRole("menuitem", { name: "Change status…" }));
        const fromMenu = screen.getByRole("dialog", { name: "Change status of Example Student's order" });
        expect(fromMenu).toHaveTextContent("Now: Paid");
        expect(within(fromMenu).getAllByRole("radio").map((radio) => radio.closest("label").textContent)).toEqual([
            "Unconfirmedno stock change", "Droppedreturns items", "Refundedreturns items",
        ]);
        expect(within(fromMenu).getByRole("button", { name: "Change status" })).toBeDisabled();
        fireEvent.click(within(fromMenu).getByRole("button", { name: "Cancel" }));

        fireEvent.click(within(drawer).getByRole("button", { name: "Change status, now Paid" }));
        expect(screen.getByRole("dialog", { name: "Change status of Example Student's order" })).toHaveTextContent("Now: Paid");
    });

    it("offers Change status from an order's row menu", async () => {
        mockApi({ [PENDING]: listed([order()]) });
        renderPage();

        chooseAction(await findRow(), "More actions for Example Student's order", "Change status…");

        expect(screen.getByRole("dialog", { name: "Change status of Example Student's order" })).toHaveTextContent("Now: Unconfirmed");
    });

    it("moves a paid order back to Unconfirmed with the amount from before and the reason, and shows it as Unconfirmed", async () => {
        const { fetchSpy, drawer } = await openOrderOnAll(paid, {
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "pending", amountReceivedCents: 4000, revision: 4 })),
        });

        const dialog = changeStatus(drawer, "Unconfirmed");
        expect(dialog).toHaveTextContent("Now: Paid");
        expect(dialog).toHaveTextContent("Stock doesn't change.");
        expect(dialog).toHaveTextContent("Received goes back to $40.00 of $72.00.");
        fireEvent.change(within(dialog).getByLabelText("Reason (optional)"), { target: { value: "Marked paid by mistake" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Move to Unconfirmed" }));

        await expectAnnounced("Moved back to unconfirmed: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "pending", note: "Marked paid by mistake", expectedRevision: 3 } }]);
        expect(await within(drawer).findByRole("button", { name: "Change status, now Unconfirmed" })).toBeInTheDocument();
        expect(within(await findRow()).getByText("$40.00 of $72.00 received")).toBeInTheDocument();
    });

    it("says Not recorded when no amount was recorded before the order was marked paid", async () => {
        const { drawer } = await openOrderOnAll({ status: "paid", amountReceivedCents: 7200, amountBeforePaidCents: null });

        expect(changeStatus(drawer, "Dropped")).toHaveTextContent("Received goes back to Not recorded.");
    });

    it("warns that a dropped order takes its items again, and shows why when they no longer fit", async () => {
        const { drawer } = await openOrderOnAll({ status: "not_paid" }, {
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: response({ status: "error", message: "Not enough Hoodie left in this drop to take this order's items again. Nothing changed." }, 409),
        });

        const dialog = changeStatus(drawer, "Unconfirmed");
        expect(dialog).toHaveTextContent("Takes from stock again: Hoodie, Tote Bag ×2.");
        expect(dialog).toHaveTextContent("If they are sold out or the student is at their limit, nothing changes.");
        fireEvent.click(within(dialog).getByRole("button", { name: "Move to Unconfirmed" }));

        expect(await within(drawer).findByRole("alert")).toHaveTextContent("Not enough Hoodie left in this drop to take this order's items again. Nothing changed.");
    });

    it("returns a paid order's items when it is dropped", async () => {
        const { drawer } = await openOrderOnAll(paid);

        expect(changeStatus(drawer, "Dropped")).toHaveTextContent("Returns to stock: Hoodie, Tote Bag ×2.");
    });

    it("asks to check Venmo before undoing a recorded refund", async () => {
        const { fetchSpy, drawer } = await openOrderOnAll({ status: "refunded", amountReceivedCents: 7200 }, {
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", amountReceivedCents: 7200, revision: 4 })),
        });

        const dialog = changeStatus(drawer, "Paid");
        expect(dialog).toHaveTextContent("Only do this if no refund was sent in Venmo.");
        fireEvent.click(within(dialog).getByRole("button", { name: "Move to Paid" }));

        await expectAnnounced("Marked paid: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "paid", expectedRevision: 3 } }]);
    });

    it("leaves the reason out when it is blank", async () => {
        const { fetchSpy, drawer } = await openOrderOnAll(paid, {
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "pending", amountReceivedCents: 4000, revision: 4 })),
        });
        const dialog = changeStatus(drawer, "Unconfirmed");
        fireEvent.change(within(dialog).getByLabelText("Reason (optional)"), { target: { value: "   " } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Move to Unconfirmed" }));

        await expectAnnounced("Moved back to unconfirmed: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "pending", expectedRevision: 3 } }]);
    });

    it("shows the reason and the change of amount in the order's activity", async () => {
        const history = [
            { actor: "Olive Officer", at: "2030-02-28T17:00:00.000Z", kind: "amount_received", from: "none", to: "7200" },
            { actor: "Olive Officer", at: "2030-02-28T18:00:00.000Z", kind: "payment", from: "pending", to: "paid" },
            { actor: "Olive Officer", at: "2030-02-28T19:00:00.000Z", kind: "amount_received", from: "7200", to: "none" },
            { actor: "Olive Officer", at: "2030-02-28T20:00:00.000Z", kind: "payment", from: "paid", to: "pending", note: "Marked paid by mistake" },
        ];
        mockApi({ [PENDING]: listed([order({ history })]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed({ history })) });
        renderPage();

        const activity = within(await openDrawer()).getByRole("list", { name: "Activity" });

        expect(within(activity).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
            "Olive Officer changed payment from Paid to Unconfirmed“Marked paid by mistake”Feb 28, 12:00 PM",
            "Olive Officer changed the amount received from $72.00 to Not recordedFeb 28, 11:00 AM",
            "Olive Officer changed payment from Unconfirmed to PaidFeb 28, 10:00 AM",
            "Olive Officer recorded $72.00 receivedFeb 28, 9:00 AM",
            "Example Student confirmed the orderFeb 27, 9:30 AM",
        ]);
    });
});

describe("amount received", () => {
    // In the drawer the amount is entered next to the Received figure; in a row, from its "···" menu.
    function openAmount(drawer) {
        fireEvent.click(within(within(drawer).getByRole("group", { name: "Payment" })).getByRole("button", { name: "Enter amount received" }));
        return confirmDialog("Amount received");
    }

    it("previews what will remain while typing, then records a partial payment", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()),
            [`PATCH ${LIST}/${ORDER_ID}/amount-received`]: saved(detailed({ amountReceivedCents: 5000, revision: 4 })),
        });
        renderPage();
        const drawer = await openDrawer();
        const dialog = openAmount(drawer);

        fireEvent.change(within(dialog).getByLabelText("Amount received ($)"), { target: { value: "50" } });
        expect(dialog).toHaveTextContent("$22.00 will remain.");
        fireEvent.click(within(dialog).getByRole("button", { name: "Save amount" }));

        await waitFor(() => expect(within(drawer).getByRole("group", { name: "Payment" })).toHaveTextContent("Expected$72.00Received$50.00EditRemaining$22.00"));
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/amount-received`, body: { amountReceivedCents: 5000, expectedRevision: 3 } }]);
        await expectAnnounced("Recorded $50.00 received: Example Student");
    });

    it("says an amount that covers the order marks it paid before saving it", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()),
            [`PATCH ${LIST}/${ORDER_ID}/amount-received`]: saved(detailed({ status: "paid", amountReceivedCents: 8000, revision: 4 })),
        });
        renderPage();
        const drawer = await openDrawer();
        const dialog = openAmount(drawer);

        fireEvent.change(within(dialog).getByLabelText("Amount received ($)"), { target: { value: "80.00" } });
        expect(dialog).toHaveTextContent("$80.00 covers the $72.00 expected, so saving marks the order paid. That's $8.00 more than expected; refund the difference in Venmo.");
        expect(writes(fetchSpy)).toEqual([]);
        fireEvent.click(within(dialog).getByRole("button", { name: "Save and mark paid" }));

        expect(await within(drawer).findByText("Over by $8.00. Refund the difference in Venmo.")).toBeInTheDocument();
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/amount-received`, body: { amountReceivedCents: 8000, expectedRevision: 3 } }]);
        await expectAnnounced("Marked paid: Example Student, $72.00");
    });

    it("records an amount from the row's actions menu", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order()]),
            [`PATCH ${LIST}/${ORDER_ID}/amount-received`]: saved(detailed({ amountReceivedCents: 5000, revision: 4 })),
        });
        renderPage();
        chooseAction(await findRow(), "More actions for Example Student's order", "Enter amount received");
        const dialog = confirmDialog("Amount received");

        fireEvent.change(within(dialog).getByLabelText("Amount received ($)"), { target: { value: "50" } });
        fireEvent.click(within(dialog).getByRole("button", { name: "Save amount" }));

        expect(await within(await findRow()).findByText("$50.00 of $72.00 received")).toBeInTheDocument();
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/amount-received`, body: { amountReceivedCents: 5000, expectedRevision: 3 } }]);
    });

    it("offers to edit an amount already recorded, starting from it", async () => {
        const partial = { amountReceivedCents: 4500 };
        mockApi({ [PENDING]: listed([order(partial)]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(partial)) });
        renderPage();
        const payment = within(await openDrawer()).getByRole("group", { name: "Payment" });

        fireEvent.click(within(payment).getByRole("button", { name: "Edit amount received" }));

        expect(within(confirmDialog("Amount received")).getByLabelText("Amount received ($)")).toHaveValue("45.00");
    });

    it("rejects an amount that isn't dollars and cents without sending it", async () => {
        const fetchSpy = mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed()) });
        renderPage();
        const dialog = openAmount(await openDrawer());

        for (const value of ["", "abc", "-5", "10.555"]) {
            fireEvent.change(within(dialog).getByLabelText("Amount received ($)"), { target: { value } });
            fireEvent.click(within(dialog).getByRole("button", { name: "Save amount" }));
            expect(within(dialog).getByText("Enter an amount like 50 or 50.00.")).toBeInTheDocument();
        }
        expect(writes(fetchSpy)).toEqual([]);
    });
});

describe("pickup progress and mode switch", () => {
    const PAID = `GET ${LIST}?status=paid&followUp=all&pickup=picked_up`;

    it("tags a paid order that was picked up, in its row", async () => {
        mockApi({
            [PENDING]: listed([]),
            [PAID]: listed([order({ status: "paid", pickup: { pickedUpAt: "2030-03-01T18:05:00.000Z", pickedUpBy: "Jordan Lee" } })]),
        });
        renderPage();

        fireEvent.click(await screen.findByRole("tab", { name: /^Picked up/ }));

        expect(within(await findRow()).getByText("Picked up")).toBeInTheDocument();
    });

    it("lists pickups and undone pickups in the order's activity", async () => {
        const history = [
            { actor: "Jordan Lee", at: "2030-03-01T18:05:00.000Z", kind: "pickup", from: "not_picked_up", to: "picked_up" },
            { actor: "Jordan Lee", at: "2030-03-01T18:06:00.000Z", kind: "pickup", from: "picked_up", to: "not_picked_up" },
        ];
        mockApi({ [PENDING]: listed([order()]), [`GET ${LIST}/${ORDER_ID}`]: saved(detailed({ status: "paid", history })) });
        renderPage();

        const activity = within(await openDrawer()).getByRole("list", { name: "Activity" });

        await waitFor(() => expect(activity).toHaveTextContent("Jordan Lee marked picked up"));
        expect(activity).toHaveTextContent("Jordan Lee cleared picked up");
    });

    it("links to the Pickup page from the admin bar, with Orders marked as the current page", async () => {
        mockApi({ [PENDING]: listed([]) });
        renderPage();

        const bar = screen.getByRole("banner");
        expect(within(bar).getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
        expect(within(bar).getByRole("link", { name: "Pickup" })).toHaveAttribute("href", "/admin/shop/pickup");
        expect(within(bar).getByRole("link", { name: "Pickup" })).not.toHaveAttribute("aria-current");
    });
});

describe("orders changed after pickup", () => {
    const PICKED_UP = { pickedUpAt: "2030-03-01T18:05:00.000Z", pickedUpBy: "Jordan Lee" };
    const PAID_LIST = `GET ${LIST}?status=paid&followUp=all&pickup=picked_up`;
    const REFUNDED_LIST = `GET ${LIST}?status=refunded&followUp=all`;
    const WARNING = "by Jordan Lee. Only continue if the student returned the merch.";

    // Lists the order on the All tab and opens its drawer, so a status change can be picked there.
    async function openOrderOnAll(listedOrder, routes = {}) {
        const fetchSpy = mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=all&followUp=all`]: listed([order(listedOrder)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(listedOrder)),
            ...routes,
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^All/ }));
        return { fetchSpy, drawer: await openDrawer() };
    }

    it("warns before refunding a picked-up order, and keeps Record refund disabled until a reason is entered", async () => {
        const paid = { status: "paid", amountReceivedCents: 7200, pickup: PICKED_UP };
        const fetchSpy = mockApi({
            [PENDING]: listed([]),
            [PAID_LIST]: listed([order(paid)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(paid)),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ ...paid, status: "refunded", revision: 4 })),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Picked up/ }));
        chooseAction(await openDrawer(), "More actions", "Record refund");

        const dialog = confirmDialog("Record refund for Example Student's $72.00 order?");
        expect(dialog).toHaveTextContent(WARNING);
        const confirm = within(dialog).getByRole("button", { name: "Record refund" });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "   " } });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Returned the hoodie" } });
        expect(confirm).toBeEnabled();
        fireEvent.click(confirm);

        await expectAnnounced("Refund recorded: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "refunded", note: "Returned the hoodie", expectedRevision: 3 } }]);
    });

    it("warns before moving a picked-up order to Unconfirmed, and keeps the move disabled until a reason is entered", async () => {
        const refunded = { status: "refunded", amountReceivedCents: 7200, pickup: PICKED_UP };
        const { fetchSpy, drawer } = await openOrderOnAll(refunded, {
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ ...refunded, status: "pending", revision: 4 })),
        });
        fireEvent.click(within(drawer).getByRole("button", { name: /^Change status, now / }));
        const dialog = screen.getByRole("dialog", { name: "Change status of Example Student's order" });
        fireEvent.click(within(dialog).getByRole("radio", { name: /^Unconfirmed/ }));

        expect(dialog).toHaveTextContent(WARNING);
        const confirm = within(dialog).getByRole("button", { name: "Move to Unconfirmed" });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Student paid again" } });
        expect(confirm).toBeEnabled();
        fireEvent.click(confirm);

        await expectAnnounced("Moved back to unconfirmed: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "pending", note: "Student paid again", expectedRevision: 3 } }]);
    });

    it("warns before dropping a picked-up unconfirmed order, and requires a reason", async () => {
        const fetchSpy = mockApi({
            [PENDING]: listed([order({ pickup: PICKED_UP })]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed({ pickup: PICKED_UP })),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "not_paid", pickup: PICKED_UP, revision: 4 })),
        });
        renderPage();
        chooseAction(await openDrawer(), "More actions", "Drop unconfirmed order");

        const dialog = confirmDialog("Drop Example Student's $72.00 order?");
        expect(dialog).toHaveTextContent(WARNING);
        const confirm = within(dialog).getByRole("button", { name: "Drop unconfirmed order" });
        expect(confirm).toBeDisabled();
        fireEvent.change(within(dialog).getByLabelText("Reason (required)"), { target: { value: "Student returned it" } });
        fireEvent.click(confirm);

        await expectAnnounced("Dropped: Example Student, $72.00");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/payment`, body: { status: "not_paid", note: "Student returned it", expectedRevision: 3 } }]);
    });

    it("asks for no reason and shows no warning when refunding an order that was never picked up", async () => {
        const paid = { status: "paid", amountReceivedCents: 7200 };
        mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=paid&followUp=all&pickup=ready`]: listed([order(paid)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(paid)),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Ready for pickup/ }));
        chooseAction(await openDrawer(), "More actions", "Record refund");

        const dialog = confirmDialog("Record refund for Example Student's $72.00 order?");
        expect(dialog).not.toHaveTextContent("picked up");
        expect(within(dialog).queryByLabelText("Reason (required)")).not.toBeInTheDocument();
        expect(within(dialog).getByRole("button", { name: "Record refund" })).toBeEnabled();
    });

    it("flags a refunded order that was picked up, in its row and in its drawer", async () => {
        const refunded = { status: "refunded", amountReceivedCents: 7200, pickup: PICKED_UP };
        mockApi({
            [PENDING]: listed([]),
            [REFUNDED_LIST]: listed([order(refunded)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(refunded)),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Refunded/ }));

        expect(within(await findRow()).getByText("Refunded after pickup")).toBeInTheDocument();
        const drawer = await openDrawer();
        expect(within(drawer).getByText("Refunded after pickup")).toBeInTheDocument();
        expect(within(drawer).getByText(/Picked up .+ by Jordan Lee/)).toBeInTheDocument();
    });

    it("flags an order changed after pickup in its row, and shows only the Picked up tag while it is still paid", async () => {
        mockApi({
            [PENDING]: listed([]),
            [`GET ${LIST}?status=all&followUp=all`]: listed([order({ status: "not_paid", pickup: PICKED_UP }), order({ id: OTHER_ID, buyer: { id: "b2", name: "Marco Reyes", email: "mreyes@uw.edu" }, status: "paid", pickup: PICKED_UP })]),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^All/ }));

        expect(within(await findRow()).getByText("Changed after pickup")).toBeInTheDocument();
        const paidRow = (await findRow("Marco Reyes"));
        expect(within(paidRow).getByText("Picked up")).toBeInTheDocument();
        expect(within(paidRow).queryByText(/after pickup/)).not.toBeInTheDocument();
    });

    it("says in the activity that an order was refunded after pickup, with the reason", async () => {
        const history = [
            { actor: "Jordan Lee", at: "2030-03-01T18:05:00.000Z", kind: "pickup", from: "not_picked_up", to: "picked_up" },
            { actor: "Jordan Lee", at: "2030-03-01T18:10:00.000Z", kind: "payment", from: "paid", to: "refunded", note: "Returned the hoodie", afterPickup: true },
        ];
        const refunded = { status: "refunded", amountReceivedCents: 7200, pickup: PICKED_UP, history };
        mockApi({
            [PENDING]: listed([order()]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(refunded)),
        });
        renderPage();

        const activity = within(await openDrawer()).getByRole("list", { name: "Activity" });

        await waitFor(() => expect(activity).toHaveTextContent("Jordan Lee refunded this order after pickup"));
        expect(activity).toHaveTextContent("“Returned the hoodie”");
    });

    it("offers only a general message on a refunded order that was overpaid, since the whole amount goes back", async () => {
        const refunded = { status: "refunded", amountReceivedCents: 8000 };
        mockApi({
            [PENDING]: listed([]),
            [REFUNDED_LIST]: listed([order(refunded)]),
            [`GET ${LIST}/${ORDER_ID}`]: saved(detailed(refunded)),
        });
        renderPage();
        fireEvent.click(screen.getByRole("tab", { name: /^Refunded/ }));
        fireEvent.click(within(await openContact(await openDrawer())).getByRole("button", { name: "Write email" }));

        expect(screen.queryByRole("option", { name: "Paid too much" })).not.toBeInTheDocument();
        expect(gmailDraft("su")).toBe("Your IUGA order ...00ff");
        expect(gmailDraft("body")).not.toContain("returning the extra");
    });

    it("does not offer Undo after marking an unconfirmed order paid when it was already picked up, since Undo would need a reason", async () => {
        mockApi({
            [PENDING]: listed([order({ pickup: PICKED_UP })]),
            [`PATCH ${LIST}/${ORDER_ID}/payment`]: saved(detailed({ status: "paid", pickup: PICKED_UP, revision: 4, amountReceivedCents: 7200 })),
        });
        renderPage();

        fireEvent.click(within(await findRow()).getByRole("button", { name: "Mark paid" }));
        fireEvent.click(within(confirmDialog("Mark $72.00 as paid?")).getByRole("button", { name: "Mark paid" }));

        await expectAnnounced("Marked paid: Example Student, $72.00");
        expect(screen.queryByRole("button", { name: "Undo mark paid for Example Student" })).not.toBeInTheDocument();
    });
});
