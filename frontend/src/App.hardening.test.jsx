import { render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

vi.mock("./context/AuthContext", () => ({
    useAuthContext: () => ({ isAuthenticated: false, signIn: vi.fn(), signOut: vi.fn() }),
}));

beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) =>
        String(url).includes("/shop/")
            ? { ok: false, status: 404, json: async () => ({ status: "error", message: "Not available" }) }
            : { ok: true, json: async () => [] });
    document.title = "IUGA UW";
});

afterEach(() => vi.restoreAllMocks());

test.each([
    ["/EVENTS", "Events"],
    ["/SHOP/CHECKOUT/example-hold", "Checkout"],
])("the page title follows the case-insensitive route at %s", async (path, title) => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    await waitFor(() => expect(document.title).toBe(`${title} | IUGA UW`));
});
