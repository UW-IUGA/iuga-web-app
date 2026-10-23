import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ElectionsFAQPage from "./ElectionsFAQ";

test("a keyboard category jump moves focus to the requested FAQ heading", async () => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    try {
        render(<MemoryRouter><ElectionsFAQPage electionFAQ={{
            "Election Eligibility": [], "Campaigning Rules": [], "Campaign Rules": [],
        }} /></MemoryRouter>);
        screen.getByRole("button", { name: "Campaigning Rules" }).focus();
        await userEvent.keyboard("{Enter}");
        expect(screen.getByRole("heading", { name: "Campaigning Rules" })).toHaveFocus();
    } finally {
        vi.restoreAllMocks();
    }
});
