import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ElectionPage from "./Elections";

const candidates = {
    "2026": [
        { name: "Alex", position: "President", blurb: "Alex's platform", media: "about:blank" },
        { name: "Sam", position: "President", blurb: "Sam's platform", media: "about:blank" },
        { name: "Jordan", position: "Vice President", blurb: "Jordan's platform", media: "about:blank" },
    ],
    "2025": [],
};

test("students can choose election positions using the keyboard", async () => {
    render(<ElectionPage candidates={candidates} />);
    const position = screen.getByRole("button", { name: "Vice President" });
    position.focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("Jordan's platform")).toBeInTheDocument();
    expect(position).toHaveAttribute("aria-pressed", "true");
});

test("students can read another candidate's platform using the keyboard", async () => {
    render(<ElectionPage candidates={candidates} />);
    const candidate = screen.getByRole("button", { name: "Sam" });
    candidate.focus();
    await userEvent.keyboard(" ");
    expect(await screen.findByText("Sam's platform")).toBeInTheDocument();
    expect(screen.queryByText("Alex's platform")).not.toBeInTheDocument();
    expect(candidate).toHaveAttribute("aria-pressed", "true");
});

test("students can select an election year with the labelled native year control", async () => {
    render(<ElectionPage candidates={candidates} />);
    userEvent.selectOptions(screen.getByRole("combobox", { name: "Election year" }), "2025");
    expect(await screen.findByText("There are no active elections right now.")).toBeInTheDocument();
});
