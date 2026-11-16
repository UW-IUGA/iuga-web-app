/*
Purpose: Pin what the archived Elections FAQ page shows and does, so its styles can be renamed safely.
Expected Request Information: None; renders the page with a small FAQ fixture.
Expected Response Information: Vitest results.
*/
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import ElectionsFAQPage from "./ElectionsFAQ";
import { electionfaqTags } from "../assets/data/Enum";

const electionFAQ = Object.fromEntries(Object.values(electionfaqTags).map((category) => [category, []]));
electionFAQ[electionfaqTags.ELECTION_ELIGIBILITY] = [
    { rName: "Who can run?", rDescription: "Any enrolled Informatics undergraduate." },
];

function renderPage() {
    return render(
        <MemoryRouter>
            <ElectionsFAQPage electionFAQ={electionFAQ} />
        </MemoryRouter>,
    );
}

describe("Elections FAQ page", () => {
    beforeEach(() => {
        window.scrollTo = vi.fn();
    });

    it("lists every category in the side legend and as a section heading", () => {
        renderPage();
        const legend = screen.getByRole("heading", { name: "Categories" }).parentElement;
        expect(within(legend).getAllByRole("listitem").map((item) => item.textContent)).toEqual(
            Object.values(electionfaqTags),
        );
        expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(
            Object.values(electionfaqTags),
        );
    });

    it("shows each question under its category", () => {
        renderPage();
        expect(screen.getByRole("heading", { name: "Who can run?" })).toBeInTheDocument();
        expect(screen.getByText("Any enrolled Informatics undergraduate.")).toBeInTheDocument();
    });

    it("scrolls to a category, 100px above it, when its legend entry is clicked", () => {
        renderPage();
        const section = screen.getByRole("heading", { level: 2, name: "Campaign Rules" }).parentElement.parentElement;
        section.getBoundingClientRect = () => ({ top: 500 });
        window.scrollTo.mockClear();
        const legend = screen.getByRole("heading", { name: "Categories" }).parentElement;
        fireEvent.click(within(legend).getByText("Campaign Rules"));
        expect(window.scrollTo).toHaveBeenCalledWith({ top: 400 + window.pageYOffset, behavior: "smooth" });
    });
});
