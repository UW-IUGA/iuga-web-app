import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GetInvolvedPage from "./GetInvolved";

afterEach(() => {
    vi.unstubAllGlobals();
});

test("offers only current committees and their leaders", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "success", application: { isOpen: false } }),
    }));

    render(<MemoryRouter><GetInvolvedPage /></MemoryRouter>);

    const committees = screen.getByRole("region", { name: "Find your way to contribute" });
    expect(within(committees).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent))
        .toEqual(["IT Committee", "Creative Committee"]);
    const leaders = screen.getByRole("group", { name: "Committee lead profiles" });
    expect(within(leaders).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent))
        .toEqual(["Ellie Marsh", "Yonie Rivera"]);
    expect(screen.queryByText(/Nitya Shankar/)).not.toBeInTheDocument();
    expect(await screen.findAllByRole("button", { name: /Contact/ })).toHaveLength(2);
});
