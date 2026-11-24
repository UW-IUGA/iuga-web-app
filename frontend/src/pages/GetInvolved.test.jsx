import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import GetInvolvedPage from "./GetInvolved";
import { resetPageEntranceForTests } from "../utils/pageEntrance";

beforeEach(() => {
    resetPageEntranceForTests();
});

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

test("waves the lead cards and committee rows in on the first visit", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "success", application: { isOpen: false } }),
    }));

    render(<MemoryRouter><GetInvolvedPage /></MemoryRouter>);

    expect(document.querySelector("main.getInvolved")).toHaveClass("pageEntrance--enter");
    const leads = [...document.querySelectorAll(".getInvolved__leaderProfile .studentProfileCard")];
    expect(leads).toHaveLength(2);
    expect(leads[0]).toHaveClass("pageEntrance__hero");
    expect(leads[0].style.getPropertyValue("--entrance-i")).toBe("0");
    expect(leads[1].style.getPropertyValue("--entrance-i")).toBe("1");

    const rows = [...document.querySelectorAll("article.getInvolved__committee")];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveClass("pageEntrance__listItem");
    expect(rows[1].style.getPropertyValue("--entrance-i")).toBe("1");
});
