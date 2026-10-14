import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import EventsPage from "./Events";

vi.mock("../runtime", () => ({ isProduction: false, apiBaseUrl: "" }));
vi.mock("../context/AuthContext", () => ({
    useAuthContext: () => ({ isAuthenticated: false, isAdmin: false }),
}));

describe("Snack & Build in the Events agenda", () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    });
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    test("a signed-out student can open a finals-week session and read the drop-in details", async () => {
        vi.setSystemTime(new Date(2026, 11, 15, 9));
        render(<MemoryRouter><EventsPage /></MemoryRouter>);

        const sessions = screen.getAllByRole("button", { name: /^Snack & Build,/ });
        expect(sessions).toHaveLength(2);
        fireEvent.click(sessions[0]);
        const dialog = screen.getByRole("dialog", { name: "Snack & Build" });
        expect(within(dialog).getByText("Hosted by iStartup Lab")).toBeInTheDocument();
        expect(within(dialog).getByText("iStartup Lab, MGH 310")).toBeInTheDocument();
        expect(await within(dialog).findByText(/Drop in; no RSVP required/)).toBeInTheDocument();
        expect(within(dialog).queryByRole("button", { name: "RSVP" })).not.toBeInTheDocument();
    });

    test("Thanksgiving week has only Tuesday's session", () => {
        vi.setSystemTime(new Date(2026, 10, 24, 9));
        render(<MemoryRouter><EventsPage /></MemoryRouter>);
        expect(screen.getAllByRole("button", { name: /^Snack & Build,/ })).toHaveLength(1);
        expect(screen.getByRole("button", { name: /^Snack & Build, Tuesday, November 24/ })).toBeInTheDocument();
    });

    test("no Snack & Build sessions are shown during winter break", () => {
        vi.setSystemTime(new Date(2026, 11, 22, 9));
        render(<MemoryRouter><EventsPage /></MemoryRouter>);
        expect(screen.queryByRole("button", { name: /^Snack & Build,/ })).not.toBeInTheDocument();
    });
});
