import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import AboutPage from "./About";
import { iugaTeams } from "../assets/data/AboutData";
import { groupType } from "../assets/data/Enum";

const approvedNames = iugaTeams[2026][groupType.OFFICERS].map((officer) => officer.name);
const allYears = Object.keys(iugaTeams).map(String);

describe("AboutPage", () => {
    test("renders the latest team roster by default", () => {
        render(<AboutPage teams={iugaTeams} />);

        expect(screen.getByRole("heading", { level: 1, name: "About Us" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 2, name: "Meet the 2026 Team" })).toBeInTheDocument();
        expect(
            screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent).filter((name) => approvedNames.includes(name))
        ).toEqual(approvedNames);
    });

    test("switches the team roster when a prior year is selected", () => {
        render(<AboutPage teams={iugaTeams} />);

        const filter = screen.getByRole("group", { name: "Team year" });
        expect(within(filter).getAllByRole("button").map((button) => button.textContent)).toEqual(allYears);
        fireEvent.click(within(filter).getByRole("button", { name: "2025" }));

        expect(screen.getByRole("heading", { level: 2, name: "Meet the 2025 Team" })).toBeInTheDocument();
        expect(within(filter).getByRole("button", { name: "2025" })).toHaveAttribute("aria-pressed", "true");
    });
});
