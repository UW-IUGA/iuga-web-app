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

test("students can select an election year with the labelled native year control", async () => {
    render(<ElectionPage candidates={candidates} />);
    userEvent.selectOptions(screen.getByRole("combobox", { name: "Election year" }), "2025");
    expect(await screen.findByText("There are no active elections right now.")).toBeInTheDocument();
});
