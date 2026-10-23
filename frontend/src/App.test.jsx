import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

test("browser titles describe the current page after client-side navigation", async () => {
    render(<MemoryRouter initialEntries={["/resources"]}><App /></MemoryRouter>);
    await waitFor(() => expect(document.title).toBe("Resources | IUGA UW"));
    userEvent.click(screen.getByRole("link", { name: "About" }));
    await waitFor(() => expect(document.title).toBe("About | IUGA UW"));
});

test.each([
    ["/", "Home"], ["/events", "Events"], ["/student-voice", "Student Voice"],
    ["/shop", "Shop"], ["/shop/checkout/example-hold", "Checkout"],
    ["/elections", "Elections"], ["/electionfaq", "Election FAQ"],
    ["/get-involved", "Get Involved"],
])("%s has a descriptive title, including signed-out views", async (path, title) => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    await waitFor(() => expect(document.title).toBe(`${title} | IUGA UW`));
});
