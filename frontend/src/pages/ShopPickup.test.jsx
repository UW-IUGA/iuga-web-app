/*
 * Purpose: Officer Pickup page behavior: the list of orders ready for pickup (grouped A-Z, sortable, with a letter
 *          rail), live search across every payment status, marking a paid order picked up and undoing it, keeping
 *          the list fresh from the server, and reporting saves truthfully (failures, lost connections, and orders
 *          another officer changed first).
 * Authentication/Authorization Requirements: Auth and the review API are mocked; no live orders.
 * Expected Request Information: Officer views, searches, and taps, and the review API responses.
 * Expected Response Information: The ready list with its progress line, matching orders, each order's pickup
 *          state, confirmations and failure notices in the single status line, and the requests sent.
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ShopPickupPage from "./ShopPickup";

const auth = vi.hoisted(() => ({
    isAuthenticated: true,
    authLoading: false,
    user: { _id: "officer-1", uFirstName: "Olive" },
    signIn: vi.fn(),
    signOut: vi.fn(),
    can: () => true,
}));
vi.mock("../context/AuthContext", () => ({ useAuthContext: () => auth }));

const LIST = "/api/v1/shop/purchases";
const BOARD = `GET ${LIST}/pickup`;
const BOARD_URL = `${LIST}/pickup`;
const ORDER_ID = "64b0000000000000000000ff";
const OTHER_ID = "64b0000000000000000000ee";
const SEARCH = `GET ${LIST}?status=all&q=Example`;
const PICKUP = `PATCH ${LIST}/${ORDER_ID}/pickup`;
const DETAIL = `GET ${LIST}/${ORDER_ID}`;
const CONFLICT = "Another officer updated this order. Review the latest details before choosing an action.";
const NOT_SAVED = "Not saved — check your connection and try again.";
const SEARCH_LABEL = "Search by name, email, or Venmo";
const SORT_KEY = "shopPickup.sortBy";
const POLL_MS = 15000;

function order(overrides = {}) {
    return {
        id: ORDER_ID,
        buyer: { id: "64b0000000000000000000bb", name: "Example Student", email: "example@uw.edu", firstName: "Example", lastName: "Student", preferredName: null },
        venmoUsername: "example-student",
        lines: [
            { sku: "info-hoodie", name: "Hoodie", size: "M", quantity: 1, unitPriceCents: 3200, lineTotalCents: 3200 },
            { sku: "info-tote-bag", name: "Tote Bag", size: "One Size", quantity: 2, unitPriceCents: 2000, lineTotalCents: 4000 },
        ],
        totalCents: 7200,
        amountReceivedCents: null,
        confirmedAt: "2030-02-27T17:30:00.000Z",
        status: "paid",
        revision: 3,
        followUp: { status: null, updatedBy: null, updatedAt: null },
        pickup: { pickedUpAt: null, pickedUpBy: null },
        history: [],
        ...overrides,
    };
}

// A paid order for a named student, with a Venmo name built from it. Ids are 24 hex characters.
function idOf(number) {
    return `64b0000000000000000000${String(number).padStart(2, "0")}`;
}

function person(number, first, last, overrides = {}) {
    return order({
        id: idOf(number),
        buyer: { id: `buyer-${number}`, name: `${first} ${last}`, email: `${first}-${last}@uw.edu`.toLowerCase(), firstName: first, lastName: last, preferredName: null },
        venmoUsername: `${first}-${last}`.toLowerCase(),
        ...overrides,
    });
}

const pickedUpBy = (name, at = "2030-03-01T18:05:00.000Z") => ({ pickedUpAt: at, pickedUpBy: name });

const otherOrder = (overrides = {}) => order({
    id: OTHER_ID,
    buyer: { id: "b2", name: "Marco Reyes", email: "mreyes@uw.edu", firstName: "Marco", lastName: "Reyes", preferredName: null },
    venmoUsername: "mreyes-ux",
    lines: [{ sku: "info-tote-bag", name: "Tote Bag", size: "One Size", quantity: 1, unitPriceCents: 2000, lineTotalCents: 2000 }],
    totalCents: 2000,
    status: "pending",
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

function failure(status, message) {
    return response({ status: "error", message }, status);
}

function boardResponse(orders, { ready = orders.length, pickedUp = 0, truncated = false } = {}) {
    return response({ status: "success", orders, truncated, limit: 1000, counts: { ready, pickedUp } });
}

// Routes each request by method and full URL. A handler may be a response or a function of the request
// options; a handler that throws stands for a lost connection. The ready list starts empty unless a test gives it orders.
function mockApi(handlers) {
    const all = { [BOARD]: boardResponse([]), ...handlers };
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
        const key = `${options.method || "GET"} ${url}`;
        const handler = all[key];
        if (handler === undefined) throw new Error(`Unexpected API request: ${key}`);
        return typeof handler === "function" ? handler(options) : handler;
    });
}

function lostConnection() {
    throw new TypeError("Failed to fetch");
}

function writes(fetchSpy) {
    return fetchSpy.mock.calls
        .filter(([, options = {}]) => options.method === "PATCH")
        .map(([url, options]) => ({ url, body: JSON.parse(options.body) }));
}

function boardCalls(fetchSpy) {
    return fetchSpy.mock.calls.filter(([url, options = {}]) => url === BOARD_URL && !options.method).length;
}

function renderPage() {
    return render(
        <MemoryRouter initialEntries={["/admin/shop/pickup"]}>
            <ShopPickupPage />
        </MemoryRouter>
    );
}

function searchBox() {
    return screen.getByRole("searchbox", { name: SEARCH_LABEL });
}

// Types a search as the officer does; results follow after the short pause.
function search(text) {
    fireEvent.change(searchBox(), { target: { value: text } });
}

async function findCard(name = "Example Student") {
    return screen.findByRole("listitem", { name });
}

// A card in the search results (not the ready list, which may show the same order).
async function findSearchCard(name = "Example Student") {
    const list = await screen.findByRole("list", { name: "Matching orders" });
    return within(list).findByRole("listitem", { name });
}

async function readyRegion() {
    return screen.findByRole("region", { name: "Ready for pickup" });
}

async function readyCard(name = "Example Student") {
    return within(await readyRegion()).findByRole("listitem", { name });
}

// The order cards on the ready list, top to bottom (the item rows inside each card are not cards).
async function readyCards() {
    return within(await readyRegion()).getAllByRole("listitem").filter((item) => item.hasAttribute("aria-label"));
}

// The names of the cards on the ready list, top to bottom.
async function readyOrderNames() {
    return (await readyCards()).map((item) => item.getAttribute("aria-label"));
}

function headingLetters() {
    return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
}

async function expectStatus(text) {
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(text));
}

async function advance(ms) {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

beforeEach(() => {
    auth.isAuthenticated = true;
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
    delete document.visibilityState;
});

describe("the ready list", () => {
    it("lists every order ready for pickup on arrival, with no typing", async () => {
        const fetchSpy = mockApi({ [BOARD]: boardResponse([person(1, "Alex", "Kim"), person(2, "Sam", "Lopez")]) });
        renderPage();

        expect(await readyCard("Alex Kim")).toBeInTheDocument();
        expect(screen.getByRole("listitem", { name: "Sam Lopez" })).toBeInTheDocument();
        expect(fetchSpy.mock.calls.map(([url]) => url)).toContain(BOARD_URL);
    });

    it("groups orders under letter headings by last name, in A to Z order", async () => {
        mockApi({ [BOARD]: boardResponse([person(2, "Alex", "Kim"), person(1, "Taylor", "Brooks"), person(3, "Sam", "Lopez")]) });
        renderPage();

        await readyCard("Alex Kim");
        expect(headingLetters()).toEqual(["B", "K", "L"]);
        expect(await readyOrderNames()).toEqual(["Taylor Brooks", "Alex Kim", "Sam Lopez"]);
    });

    it("sorts by first name when the officer picks First name, and remembers that choice in this browser", async () => {
        mockApi({ [BOARD]: boardResponse([person(2, "Alex", "Kim"), person(1, "Taylor", "Brooks"), person(3, "Sam", "Lopez")]) });
        const view = renderPage();
        await readyCard("Alex Kim");

        fireEvent.click(screen.getByRole("button", { name: "First name" }));

        expect(await readyOrderNames()).toEqual(["Alex Kim", "Sam Lopez", "Taylor Brooks"]);
        expect(headingLetters()).toEqual(["A", "S", "T"]);
        expect(screen.getByRole("button", { name: "First name" })).toHaveAttribute("aria-pressed", "true");

        view.unmount();
        renderPage();

        expect(await readyCard("Alex Kim")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "First name" })).toHaveAttribute("aria-pressed", "true");
        expect(await readyOrderNames()).toEqual(["Alex Kim", "Sam Lopez", "Taylor Brooks"]);
    });

    it("works without remembering the sort when browser storage is blocked", async () => {
        const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError");
        });
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new DOMException("blocked", "SecurityError");
        });
        mockApi({ [BOARD]: boardResponse([person(1, "Alex", "Kim")]) });
        renderPage();

        expect(await readyCard("Alex Kim")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "First name" }));
        expect(screen.getByRole("button", { name: "First name" })).toHaveAttribute("aria-pressed", "true");
        expect(getItem).toHaveBeenCalled();
    });

    it("puts an order whose buyer account is gone under # after the letters, sorted by Venmo username", async () => {
        mockApi({
            [BOARD]: boardResponse([
                order({ id: "64b0000000000000000000a1", buyer: null, venmoUsername: "zeta-account" }),
                order({ id: "64b0000000000000000000a2", buyer: null, venmoUsername: "alpha-account" }),
                person(2, "Alex", "Kim"),
            ]),
        });
        renderPage();

        await readyCard("Alex Kim");
        expect(headingLetters()).toEqual(["K", "#"]);
        const cards = (await readyCards()).map((item) => item.textContent);
        expect(cards[1]).toContain("@alpha-account");
        expect(cards[2]).toContain("@zeta-account");
    });

    it("jumps to a letter's group from the A to Z rail, and disables letters with no orders", async () => {
        const scrolled = [];
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function scrollIntoView() {
            scrolled.push(this.textContent.charAt(0));
        };
        try {
            mockApi({ [BOARD]: boardResponse([person(1, "Alex", "Kim"), person(2, "Sam", "Lopez"), person(3, "Taylor", "Brooks")]) });
            renderPage();
            await readyCard("Alex Kim");

            expect(screen.getByRole("button", { name: "Jump to Q" })).toBeDisabled();
            expect(screen.getByRole("button", { name: "Jump to K" })).toBeEnabled();

            fireEvent.click(screen.getByRole("button", { name: "Jump to L" }));

            expect(scrolled).toEqual(["L"]);
        } finally {
            Element.prototype.scrollIntoView = original;
        }
    });

    it("shows the first and last name large, with a preferred name only when it differs", async () => {
        mockApi({
            [BOARD]: boardResponse([
                person(1, "Alex", "Kim", { buyer: { id: "b1", name: "Ally", email: "a@uw.edu", firstName: "Alex", lastName: "Kim", preferredName: "Ally" } }),
                person(2, "Sam", "Lopez", { buyer: { id: "b2", name: "Sam Lopez", email: "s@uw.edu", firstName: "Sam", lastName: "Lopez", preferredName: "Sam Lopez" } }),
            ]),
        });
        renderPage();

        const kim = await readyCard("Alex Kim");
        expect(within(kim).getByText("goes by Ally")).toBeInTheDocument();
        const lopez = await readyCard("Sam Lopez");
        expect(within(lopez).queryByText(/goes by/)).not.toBeInTheDocument();
    });

    it("shows no money or phone numbers on the ready cards", async () => {
        mockApi({ [BOARD]: boardResponse([person(1, "Alex", "Kim", { buyer: { id: "b1", name: "Alex Kim", email: "a@uw.edu", firstName: "Alex", lastName: "Kim", preferredName: null, phone: "2065550100" } })]) });
        renderPage();

        const region = await readyRegion();
        expect(within(region).queryByText(/\$\d/)).not.toBeInTheDocument();
        expect(within(region).queryByText(/2065550100/)).not.toBeInTheDocument();
    });

    it("shows the server's progress counts, not a count of the cards on screen", async () => {
        mockApi({ [BOARD]: boardResponse([person(1, "Alex", "Kim")], { ready: 18, pickedUp: 22 }) });
        renderPage();

        expect(await screen.findByText("18 left to pick up · 22 picked up")).toBeInTheDocument();
    });

    it("says when nobody is waiting for pickup", async () => {
        mockApi({ [BOARD]: boardResponse([], { ready: 0, pickedUp: 4 }) });
        renderPage();

        expect(await screen.findByText("No orders are waiting for pickup.")).toBeInTheDocument();
        expect(screen.getByText("0 left to pick up · 4 picked up")).toBeInTheDocument();
    });

    it("says the list is cut short when the server reports more ready orders than it sends", async () => {
        mockApi({ [BOARD]: boardResponse([person(1, "Alex", "Kim")], { ready: 1200, pickedUp: 0, truncated: true }) });
        renderPage();

        expect(await screen.findByText("Showing the first 1,000 orders. Search for anyone else.")).toBeInTheDocument();
        expect(screen.getByText("1,200 left to pick up · 0 picked up")).toBeInTheDocument();
    });

    it("says the ready list could not load, and offers to try again", async () => {
        const fetchSpy = mockApi({ [BOARD]: failure(500, "Unable to update orders right now.") });
        renderPage();

        expect(await screen.findByText("Couldn't load the pickup list. Try again.")).toBeInTheDocument();
        fetchSpy.mockImplementation(async () => boardResponse([person(1, "Alex", "Kim")]));
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await readyCard("Alex Kim")).toBeInTheDocument();
    });
});

describe("search", () => {
    it("searches every payment status by the typed text, after a short pause", async () => {
        const fetchSpy = mockApi({ [SEARCH]: listed([order()]) });
        renderPage();

        search("Example");

        await findCard();
        expect(fetchSpy.mock.calls.map(([url]) => url)).toContain(`${LIST}?status=all&q=Example`);
    });

    it("focuses the search field on arrival, labeled for name, email, or Venmo", () => {
        mockApi({});
        renderPage();

        expect(searchBox()).toHaveFocus();
        expect(searchBox()).toHaveAttribute("placeholder", SEARCH_LABEL);
    });

    it("filters the list live by name, email, or Venmo, and shows the matches without the ready list's grouping", async () => {
        mockApi({ [BOARD]: boardResponse([person(1, "Alex", "Kim")]), [SEARCH]: listed([order()]) });
        renderPage();
        await readyCard("Alex Kim");

        search("Example");

        const card = await findCard();
        expect(within(card).getByText("@example-student")).toBeInTheDocument();
        expect(within(card).getByText("Order ...00ff")).toBeInTheDocument();
        expect(within(card).getByText("1 × Hoodie — M")).toBeInTheDocument();
        expect(within(card).getByText("2 × Tote Bag — One Size")).toBeInTheDocument();
        expect(within(card).queryByText(/\$\d/)).not.toBeInTheDocument();
        expect(within(card).queryByText(/example@uw\.edu/)).not.toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Ready for pickup" })).not.toBeInTheDocument();
    });

    it("returns to the full ready list at the same sort when the search is cleared", async () => {
        mockApi({ [BOARD]: boardResponse([person(2, "Alex", "Kim"), person(1, "Taylor", "Brooks")]), [SEARCH]: listed([order()]) });
        renderPage();
        await readyCard("Alex Kim");
        fireEvent.click(screen.getByRole("button", { name: "First name" }));

        search("Example");
        await findCard();
        search("");

        expect(await readyOrderNames()).toEqual(["Alex Kim", "Taylor Brooks"]);
        expect(screen.getByRole("button", { name: "First name" })).toHaveAttribute("aria-pressed", "true");
    });

    it("says so when nothing matches", async () => {
        mockApi({ [`GET ${LIST}?status=all&q=Nobody`]: listed([]) });
        renderPage();

        search("Nobody");

        expect(await screen.findByText("No orders match “Nobody”.")).toBeInTheDocument();
    });

    it("says the search could not run, and offers to try again", async () => {
        const fetchSpy = mockApi({ [SEARCH]: failure(500, "Unable to update orders right now.") });
        renderPage();

        search("Example");

        expect(await screen.findByText("Couldn't load orders. Try again.")).toBeInTheDocument();
        fetchSpy.mockImplementation(async (url) => (url === `${LIST}?status=all&q=Example` ? listed([order()]) : boardResponse([])));
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        await findCard();
    });

    it("says when a search has more matches than the first page shows", async () => {
        mockApi({ [SEARCH]: listed([order()], "next-page") });
        renderPage();

        search("Example");

        await findCard();
        expect(screen.getByText("More orders match. Add more of the name to narrow the list.")).toBeInTheDocument();
    });
});

describe("pickup state on each result", () => {
    it("offers Picked up for a paid order not yet handed over", async () => {
        mockApi({ [SEARCH]: listed([order()]) });
        renderPage();

        search("Example");

        const card = await findCard();
        expect(within(card).getByRole("button", { name: "Picked up" })).toBeEnabled();
    });

    it("shows the Husky Card reminder once on the page, not on each card", async () => {
        mockApi({ [BOARD]: boardResponse([person(1, "Alex", "Kim"), person(2, "Sam", "Lopez"), person(3, "Taylor", "Brooks")]) });
        renderPage();

        await readyCard("Alex Kim");
        expect(screen.getAllByRole("button", { name: "Picked up" })).toHaveLength(3);
        expect(screen.getAllByText(/Husky Card name/i)).toHaveLength(1);
    });

    it("shows when and by whom a paid order was picked up, with no button to do it again", async () => {
        mockApi({ [SEARCH]: listed([order({ pickup: pickedUpBy("Jordan Lee") })]) });
        renderPage();

        search("Example");

        const card = await findCard();
        expect(within(card).queryByRole("button", { name: "Picked up" })).not.toBeInTheDocument();
        expect(within(card).getByText(/^Picked up · .+ by Jordan Lee$/)).toBeInTheDocument();
    });

    it("says an unconfirmed or dropped order can't be handed over yet, with no button", async () => {
        mockApi({
            [`GET ${LIST}?status=all&q=Marco`]: listed([
                otherOrder({ status: "pending" }),
                otherOrder({ id: "64b0000000000000000000ad", status: "not_paid" }),
            ]),
        });
        renderPage();

        search("Marco");

        const list = await screen.findByRole("list", { name: "Matching orders" });
        const cards = within(list).getAllByRole("listitem", { name: "Marco Reyes" });
        expect(cards).toHaveLength(2);
        for (const card of cards) {
            expect(within(card).getByText("Payment not confirmed — can't hand over yet")).toBeInTheDocument();
            expect(within(card).queryByRole("button", { name: "Picked up" })).not.toBeInTheDocument();
        }
    });

    it("says a refunded order must not be handed over, with no button", async () => {
        mockApi({ [`GET ${LIST}?status=all&q=Marco`]: listed([otherOrder({ status: "refunded" })]) });
        renderPage();

        search("Marco");

        const card = await findCard("Marco Reyes");
        expect(within(card).getByText("Refunded — don't hand over")).toBeInTheDocument();
        expect(within(card).queryByRole("button", { name: "Picked up" })).not.toBeInTheDocument();
    });
});

describe("marking an order picked up", () => {
    it("removes the card from the ready list, confirms with Undo, and refreshes the counts from the server", async () => {
        const state = { orders: [person(1, "Taylor", "Brooks"), person(2, "Alex", "Kim")], pickedUp: 0 };
        const fetchSpy = mockApi({
            [BOARD]: () => boardResponse(state.orders, { pickedUp: state.pickedUp }),
            [`PATCH ${LIST}/${idOf(1)}/pickup`]: () => {
                state.orders = state.orders.filter((item) => item.id !== idOf(1));
                state.pickedUp = 1;
                return saved(person(1, "Taylor", "Brooks", { revision: 4, pickup: pickedUpBy("Olive Officer") }));
            },
        });
        renderPage();
        const card = await readyCard("Taylor Brooks");

        fireEvent.click(within(card).getByRole("button", { name: "Picked up" }));

        await expectStatus("Picked up: Taylor Brooks");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${idOf(1)}/pickup`, body: { pickedUp: true, expectedRevision: 3 } }]);
        expect(screen.getByRole("button", { name: "Undo picked up for Taylor Brooks" })).toBeInTheDocument();
        await waitFor(() => expect(screen.queryByRole("listitem", { name: "Taylor Brooks" })).not.toBeInTheDocument());
        expect(screen.getByRole("listitem", { name: "Alex Kim" })).toBeInTheDocument();
        expect(screen.getByText("1 left to pick up · 1 picked up")).toBeInTheDocument();
    });

    it("confirms the handoff with Undo, clears a search, and returns focus to search for the next student", async () => {
        const fetchSpy = mockApi({
            [BOARD]: boardResponse([order()]),
            [SEARCH]: listed([order()]),
            [PICKUP]: saved(order({ revision: 4, status: "paid", pickup: pickedUpBy("Olive Officer") })),
        });
        renderPage();
        search("Example");
        fireEvent.click(within(await findSearchCard()).getByRole("button", { name: "Picked up" }));

        await expectStatus("Picked up: Example Student");
        expect(writes(fetchSpy)).toEqual([{ url: `${LIST}/${ORDER_ID}/pickup`, body: { pickedUp: true, expectedRevision: 3 } }]);
        expect(screen.getByRole("button", { name: "Undo picked up for Example Student" })).toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "Matching orders" })).not.toBeInTheDocument();
        expect(searchBox()).toHaveValue("");
        await waitFor(() => expect(searchBox()).toHaveFocus());
    });

    it("tells the truth when the order could not be saved: a lost connection is not shown as picked up", async () => {
        mockApi({ [BOARD]: boardResponse([order()]), [PICKUP]: lostConnection });
        renderPage();
        fireEvent.click(within(await readyCard()).getByRole("button", { name: "Picked up" }));

        await expectStatus(NOT_SAVED);
        const card = await readyCard();
        expect(within(card).getByRole("button", { name: "Picked up" })).toBeEnabled();
        expect(within(card).queryByText(/^Picked up ·/)).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Undo/ })).not.toBeInTheDocument();
    });

    it("tells the truth when the server fails: the order stays on the list, not picked up", async () => {
        mockApi({ [BOARD]: boardResponse([order()]), [PICKUP]: failure(500, "Unable to update orders right now.") });
        renderPage();
        fireEvent.click(within(await readyCard()).getByRole("button", { name: "Picked up" }));

        await expectStatus(NOT_SAVED);
        expect(within(await readyCard()).queryByText(/^Picked up ·/)).not.toBeInTheDocument();
    });

    it("keeps a stale tap refused by the revision guard, and shows who picked the order up", async () => {
        const state = { orders: [order()] };
        mockApi({
            [BOARD]: () => boardResponse(state.orders),
            [PICKUP]: () => {
                state.orders = [];
                return failure(409, CONFLICT);
            },
            [DETAIL]: saved(order({ revision: 4, pickup: pickedUpBy("Jordan Lee") })),
        });
        renderPage();
        fireEvent.click(within(await readyCard()).getByRole("button", { name: "Picked up" }));

        await expectStatus(CONFLICT);
        const card = await readyCard();
        expect(within(card).getByText(/^Picked up · .+ by Jordan Lee$/)).toBeInTheDocument();
        expect(within(card).queryByRole("button", { name: "Picked up" })).not.toBeInTheDocument();
    });

    it("holds newly ready orders out of the list while a confirmation shows, and shows them after Undo", async () => {
        const state = { orders: [person(1, "Taylor", "Brooks"), person(2, "Sam", "Lopez")], pickedUp: 0 };
        const fetchSpy = mockApi({
            [BOARD]: () => boardResponse(state.orders, { pickedUp: state.pickedUp }),
            [`PATCH ${LIST}/${idOf(1)}/pickup`]: (options) => {
                if (JSON.parse(options.body).pickedUp) {
                    state.orders = state.orders.filter((item) => item.id !== idOf(1));
                    state.pickedUp = 1;
                    return saved(person(1, "Taylor", "Brooks", { revision: 4, pickup: pickedUpBy("Olive Officer") }));
                }
                state.orders = [person(3, "Ann", "Abbott"), person(1, "Taylor", "Brooks"), person(2, "Sam", "Lopez")];
                state.pickedUp = 0;
                return saved(person(1, "Taylor", "Brooks", { revision: 5 }));
            },
        });
        renderPage();
        fireEvent.click(within(await readyCard("Taylor Brooks")).getByRole("button", { name: "Picked up" }));
        await expectStatus("Picked up: Taylor Brooks");

        // Another student becomes ready while the confirmation is showing.
        state.orders = [person(3, "Ann", "Abbott"), person(2, "Sam", "Lopez")];
        fireEvent.focus(window);
        expect(await screen.findByText("2 left to pick up · 1 picked up")).toBeInTheDocument();
        expect(screen.queryByRole("listitem", { name: "Ann Abbott" })).not.toBeInTheDocument();
        expect(screen.getByRole("listitem", { name: "Sam Lopez" })).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Undo picked up for Taylor Brooks" }));

        await expectStatus("Undid picked up: Taylor Brooks");
        expect(writes(fetchSpy).at(-1)).toEqual({ url: `${LIST}/${idOf(1)}/pickup`, body: { pickedUp: false, expectedRevision: 4 } });
        expect(await readyOrderNames()).toEqual(["Ann Abbott", "Taylor Brooks", "Sam Lopez"]);
    });

    it("refreshes an order from search when another officer picked it up first", async () => {
        mockApi({
            [BOARD]: boardResponse([]),
            [SEARCH]: listed([order()]),
            [PICKUP]: failure(409, CONFLICT),
            [DETAIL]: saved(order({ revision: 4, pickup: pickedUpBy("Jordan Lee") })),
        });
        renderPage();
        search("Example");
        fireEvent.click(within(await findSearchCard()).getByRole("button", { name: "Picked up" }));

        await expectStatus(CONFLICT);
        expect(within(await findSearchCard()).getByText(/^Picked up · .+ by Jordan Lee$/)).toBeInTheDocument();
    });
});

describe("undoing a pickup", () => {
    async function pickUpExample(extra = {}) {
        const state = { orders: [order()] };
        const fetchSpy = mockApi({
            [BOARD]: () => boardResponse(state.orders),
            [SEARCH]: listed([order()]),
            [PICKUP]: (options) => {
                if (!JSON.parse(options.body).pickedUp) {
                    state.orders = [order({ revision: 5 })];
                    return saved(order({ revision: 5 }));
                }
                state.orders = [];
                return saved(order({ revision: 4, pickup: pickedUpBy("Olive Officer") }));
            },
            ...extra,
        });
        renderPage();
        search("Example");
        fireEvent.click(within(await findSearchCard()).getByRole("button", { name: "Picked up" }));
        await screen.findByRole("button", { name: "Undo picked up for Example Student" });
        return { fetchSpy, state };
    }

    it("clears the pickup at the revision the handoff saved and reports it", async () => {
        const { fetchSpy } = await pickUpExample();

        fireEvent.click(screen.getByRole("button", { name: "Undo picked up for Example Student" }));

        await expectStatus("Undid picked up: Example Student");
        expect(writes(fetchSpy).at(-1)).toEqual({ url: `${LIST}/${ORDER_ID}/pickup`, body: { pickedUp: false, expectedRevision: 4 } });
        expect(screen.queryByRole("button", { name: /^Undo/ })).not.toBeInTheDocument();
    });

    it("puts the order back on the ready list when it is undone", async () => {
        await pickUpExample();

        fireEvent.click(screen.getByRole("button", { name: "Undo picked up for Example Student" }));

        expect(await readyCard()).toBeInTheDocument();
    });

    it("says the undo did not save when the connection is lost, and keeps Undo available to try again", async () => {
        await pickUpExample({
            [PICKUP]: (options) => {
                if (!JSON.parse(options.body).pickedUp) lostConnection();
                return saved(order({ revision: 4, pickup: pickedUpBy("Olive Officer") }));
            },
        });

        fireEvent.click(screen.getByRole("button", { name: "Undo picked up for Example Student" }));

        await expectStatus(NOT_SAVED);
        expect(screen.getByRole("button", { name: "Undo picked up for Example Student" })).toBeInTheDocument();
    });
});

describe("keeping the last handoff's confirmation", () => {
    // Taylor Brooks and Alex Kim are ready. Picking up Taylor takes her off the server's list; her Undo puts her back.
    function handoffApi(extra = {}) {
        const state = { orders: [person(1, "Taylor", "Brooks"), person(2, "Alex", "Kim")], pickedUp: 0 };
        const fetchSpy = mockApi({
            [BOARD]: () => boardResponse(state.orders, { pickedUp: state.pickedUp }),
            [`PATCH ${LIST}/${idOf(1)}/pickup`]: (options) => {
                if (JSON.parse(options.body).pickedUp) {
                    state.orders = state.orders.filter((item) => item.id !== idOf(1));
                    state.pickedUp = 1;
                    return saved(person(1, "Taylor", "Brooks", { revision: 4, pickup: pickedUpBy("Olive Officer") }));
                }
                state.orders = [person(1, "Taylor", "Brooks"), ...state.orders];
                state.pickedUp = 0;
                return saved(person(1, "Taylor", "Brooks", { revision: 5 }));
            },
            [`PATCH ${LIST}/${idOf(2)}/pickup`]: () => {
                state.orders = state.orders.filter((item) => item.id !== idOf(2));
                state.pickedUp += 1;
                return saved(person(2, "Alex", "Kim", { revision: 4, pickup: pickedUpBy("Olive Officer") }));
            },
            [`GET ${LIST}?status=all&q=Kim`]: listed([person(2, "Alex", "Kim")]),
            ...extra,
        });
        return { fetchSpy, state };
    }

    async function pickUpTaylor() {
        fireEvent.click(within(await readyCard("Taylor Brooks")).getByRole("button", { name: "Picked up" }));
        await expectStatus("Picked up: Taylor Brooks");
    }

    it("keeps the confirmation and its Undo while the officer types a new search", async () => {
        handoffApi();
        renderPage();
        await pickUpTaylor();

        search("Kim");

        expect(await findSearchCard("Alex Kim")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Picked up: Taylor Brooks");
        expect(screen.getByRole("button", { name: "Undo picked up for Taylor Brooks" })).toBeInTheDocument();
    });

    it("keeps the confirmation when the search is cleared, the sort changes, or the A to Z rail is used", async () => {
        handoffApi();
        renderPage();
        await pickUpTaylor();
        search("Kim");
        await findSearchCard("Alex Kim");

        search("");
        await readyCard("Alex Kim");
        fireEvent.click(screen.getByRole("button", { name: "First name" }));
        fireEvent.click(screen.getByRole("button", { name: "Jump to K" }));

        expect(screen.getByRole("status")).toHaveTextContent("Picked up: Taylor Brooks");
        expect(screen.getByRole("button", { name: "Undo picked up for Taylor Brooks" })).toBeInTheDocument();
    });

    it("still undoes the handoff after the officer has typed a search", async () => {
        const { fetchSpy } = handoffApi();
        renderPage();
        await pickUpTaylor();
        search("Kim");
        await findSearchCard("Alex Kim");

        fireEvent.click(screen.getByRole("button", { name: "Undo picked up for Taylor Brooks" }));

        await expectStatus("Undid picked up: Taylor Brooks");
        expect(writes(fetchSpy).at(-1)).toEqual({ url: `${LIST}/${idOf(1)}/pickup`, body: { pickedUp: false, expectedRevision: 4 } });
    });

    it("keeps the confirmation and its Undo through a background refresh, and still undoes the handoff", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const { fetchSpy } = handoffApi();
        renderPage();
        await pickUpTaylor();
        const status = screen.getByRole("status");
        const before = boardCalls(fetchSpy);

        await advance(POLL_MS);

        expect(boardCalls(fetchSpy)).toBeGreaterThan(before);
        expect(screen.getByRole("status")).toBe(status);
        expect(status).toHaveTextContent("Picked up: Taylor Brooks");
        fireEvent.click(screen.getByRole("button", { name: "Undo picked up for Taylor Brooks" }));
        await expectStatus("Undid picked up: Taylor Brooks");
        expect(writes(fetchSpy).at(-1)).toEqual({ url: `${LIST}/${idOf(1)}/pickup`, body: { pickedUp: false, expectedRevision: 4 } });
    });

    it("replaces the confirmation when the officer marks the next order picked up", async () => {
        handoffApi();
        renderPage();
        await pickUpTaylor();

        fireEvent.click(within(await readyCard("Alex Kim")).getByRole("button", { name: "Picked up" }));

        await expectStatus("Picked up: Alex Kim");
        expect(screen.queryByRole("button", { name: "Undo picked up for Taylor Brooks" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Undo picked up for Alex Kim" })).toBeInTheDocument();
    });

    it("removes the confirmation and its Undo when the officer dismisses it", async () => {
        const { fetchSpy } = handoffApi();
        renderPage();
        await pickUpTaylor();

        fireEvent.click(screen.getByRole("button", { name: "Dismiss confirmation" }));

        expect(screen.getByRole("status").textContent).toBe("");
        expect(screen.queryByRole("button", { name: /^Undo/ })).not.toBeInTheDocument();
        expect(writes(fetchSpy)).toHaveLength(1);
    });

    it("shows newly ready orders once the officer types, while the confirmation stays", async () => {
        const { state } = handoffApi();
        renderPage();
        await pickUpTaylor();
        state.orders = [...state.orders, person(3, "Ann", "Abbott")];
        fireEvent.focus(window);
        expect(await screen.findByText("2 left to pick up · 1 picked up")).toBeInTheDocument();
        expect(screen.queryByRole("listitem", { name: "Ann Abbott" })).not.toBeInTheDocument();

        search("Kim");
        await findSearchCard("Alex Kim");
        search("");

        expect(await readyCard("Ann Abbott")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Picked up: Taylor Brooks");
    });

    it("shows newly ready orders once the officer changes the sort, while the confirmation stays", async () => {
        const { state } = handoffApi();
        renderPage();
        await pickUpTaylor();
        state.orders = [...state.orders, person(3, "Ann", "Abbott")];
        fireEvent.focus(window);
        expect(await screen.findByText("2 left to pick up · 1 picked up")).toBeInTheDocument();
        expect(screen.queryByRole("listitem", { name: "Ann Abbott" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "First name" }));

        expect(await readyCard("Ann Abbott")).toBeInTheDocument();
        expect(screen.getByRole("status")).toHaveTextContent("Picked up: Taylor Brooks");
    });
});

describe("keeping the list fresh", () => {
    it("removes an order another officer completed, on the next refresh", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const state = { orders: [person(1, "Alex", "Kim"), person(2, "Sam", "Lopez")] };
        mockApi({ [BOARD]: () => boardResponse(state.orders) });
        renderPage();
        await readyCard("Sam Lopez");

        state.orders = [state.orders[0]];
        await advance(POLL_MS);

        await waitFor(() => expect(screen.queryByRole("listitem", { name: "Sam Lopez" })).not.toBeInTheDocument());
        expect(screen.getByRole("listitem", { name: "Alex Kim" })).toBeInTheDocument();
    });

    it("refreshes when the window regains focus", async () => {
        const fetchSpy = mockApi({ [BOARD]: boardResponse([]) });
        renderPage();
        await screen.findByText("No orders are waiting for pickup.");
        const before = boardCalls(fetchSpy);

        fireEvent.focus(window);

        await waitFor(() => expect(boardCalls(fetchSpy)).toBe(before + 1));
    });

    it("refreshes about every 15 seconds while the page is open", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const fetchSpy = mockApi({ [BOARD]: boardResponse([]) });
        renderPage();
        await screen.findByText("No orders are waiting for pickup.");
        const before = boardCalls(fetchSpy);

        await advance(POLL_MS);

        expect(boardCalls(fetchSpy)).toBe(before + 1);
    });

    it("does not send a second refresh while one is still running", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const fetchSpy = mockApi({ [BOARD]: () => new Promise(() => {}) });
        renderPage();

        await advance(POLL_MS * 3);

        expect(boardCalls(fetchSpy)).toBe(1);
    });

    it("pauses while the tab is hidden, and refreshes when the tab is shown again", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let visibility = "hidden";
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
        const fetchSpy = mockApi({ [BOARD]: boardResponse([]) });
        renderPage();
        await advance(0);
        const before = boardCalls(fetchSpy);

        await advance(POLL_MS * 2);
        expect(boardCalls(fetchSpy)).toBe(before);

        visibility = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
        await waitFor(() => expect(boardCalls(fetchSpy)).toBe(before + 1));
    });

    it("keeps the list on screen and says so when a refresh fails", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const state = { fail: false, orders: [person(1, "Alex", "Kim")] };
        mockApi({ [BOARD]: () => (state.fail ? failure(500, "Unable to update orders right now.") : boardResponse(state.orders)) });
        renderPage();
        await readyCard("Alex Kim");

        state.fail = true;
        await advance(POLL_MS);

        expect(await screen.findByText("Couldn't refresh the list just now. It will try again.")).toBeInTheDocument();
        expect(screen.getByRole("listitem", { name: "Alex Kim" })).toBeInTheDocument();
    });
});

describe("access and mode switch", () => {
    it("asks a signed-out visitor to sign in, without searching or showing orders", () => {
        auth.isAuthenticated = false;
        const fetchSpy = mockApi({});
        renderPage();

        expect(screen.getByRole("heading", { name: "Sign in to pick up orders" })).toBeInTheDocument();
        expect(screen.queryByRole("searchbox", { name: SEARCH_LABEL })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Sign in with UW NetID" }));
        expect(auth.signIn).toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("tells an officer without the permission they have no access, and shows no orders", async () => {
        mockApi({ [BOARD]: failure(403, "Forbidden"), [SEARCH]: failure(403, "Forbidden") });
        renderPage();

        expect(await screen.findByRole("heading", { name: "No access to pickup" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Ready for pickup" })).not.toBeInTheDocument();
        expect(screen.queryByRole("list", { name: "Matching orders" })).not.toBeInTheDocument();
    });

    it("links between Orders and Pickup in the admin bar, marking the current page", () => {
        mockApi({});
        renderPage();

        const bar = screen.getByRole("banner");
        expect(within(bar).getByRole("link", { name: "Pickup" })).toHaveAttribute("href", "/admin/shop/pickup");
        expect(within(bar).getByRole("link", { name: "Pickup" })).toHaveAttribute("aria-current", "page");
        expect(within(bar).getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/admin/shop/orders");
        expect(within(bar).getByRole("link", { name: "Orders" })).not.toHaveAttribute("aria-current");
    });
});
