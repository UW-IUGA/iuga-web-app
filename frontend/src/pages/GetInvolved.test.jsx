import { render, screen, within, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import GetInvolvedPage from "./GetInvolved";
import { team_2026 } from "../assets/data/teams/2026";
import { team_2025 } from "../assets/data/teams/2025";
import { groupType } from "../assets/data/Enum";
import { iugaTeams } from "../assets/data/AboutData";
import { useAuthContext } from "../context/AuthContext";

jest.mock("../context/AuthContext", () => ({
    useAuthContext: jest.fn(),
}));

// App imports Home -> EventStream -> EventCard, which formats dates with the
// ESM-only "dateformat" package jest cannot transform; the same factory mock
// used by EventStream.test.jsx keeps the import chain intact.
jest.mock("dateformat", () => (date, mask) => "Mar 01");

const approvedNames = team_2026[groupType.OFFICERS].map((officer) => officer.name);
const allYears = Object.keys(iugaTeams).map(String);
const above = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

const renderAppAtGetInvolved = () => {
    useAuthContext.mockReturnValue({ signIn: jest.fn(), signOut: jest.fn() });
    return render(
        <MemoryRouter initialEntries={["/get-involved"]}>
            <App />
        </MemoryRouter>
    );
};

describe("GetInvolvedPage", () => {
    test("renders the compact editorial intro heading and copy", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        expect(screen.getByRole("heading", { level: 1, name: "Get Involved" })).toBeInTheDocument();
        expect(screen.getByText(/student-led/i)).toBeInTheDocument();
    });

    test("renders the Meet the 2026 Team section with all nine approved officer names in order", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        expect(screen.getByRole("heading", { level: 2, name: "Meet the 2026 Team" })).toBeInTheDocument();
        const officerNames = screen
            .getAllByRole("heading", { level: 3 })
            .map((heading) => heading.textContent)
            .filter((name) => approvedNames.includes(name));
        expect(officerNames).toEqual(approvedNames);
    });

    test("officers without photos render the default icon and Yonie renders the provided photo", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        expect(screen.getByLabelText("Ellie Marsh photo unavailable")).toBeInTheDocument();
        expect(screen.getByLabelText("Nitya Shankar photo unavailable")).toBeInTheDocument();
        expect(screen.getByLabelText("Dia Dora photo unavailable")).toBeInTheDocument();
        expect(screen.getByRole("img", { name: "Yonie Rivera" })).toBeInTheDocument();
    });

    test("returning officers render their photos with name-based alt text", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        for (const name of ["Abraham Gibson", "Akshat Ghuge", "George Lee", "Samantha Oh", "Preeti Kotipalli", "Yonie Rivera"]) {
            expect(screen.getByRole("img", { name })).toBeInTheDocument();
        }
    });

    test("officer cards carry no committee join links; committee opportunities keep theirs", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        expect(screen.getAllByRole("link", { name: /join .* committee/i })).toHaveLength(2);
    });

    test("renders exactly two committee opportunities: IT and Creative, each with open membership and a Join CTA", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        expect(screen.getAllByRole("link", { name: /join .* committee/i })).toHaveLength(2);
        expect(screen.getByRole("heading", { level: 3, name: "IT Committee" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 3, name: "Creative Committee" })).toBeInTheDocument();
        expect(screen.getByText(/led by yonie rivera/i)).toBeInTheDocument();
        expect(screen.getByText(/led by ellie marsh/i)).toBeInTheDocument();
        expect(screen.getAllByText(/membership open/i)).toHaveLength(2);

        const itLink = screen.getByRole("link", { name: "Join IT Committee" });
        expect(itLink).toHaveAttribute("href", expect.stringMatching(/^mailto:iuga@uw\.edu\?subject=/));

        const creativeLink = screen.getByRole("link", { name: "Join Creative Committee" });
        expect(creativeLink).toHaveAttribute("href", expect.stringMatching(/^mailto:iuga@uw\.edu\?subject=/));
    });

    test("renders editorial kickers above the Team and Committees headings", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        expect(screen.getByText("Team")).toBeInTheDocument();
        expect(screen.getByText("Committees")).toBeInTheDocument();
        expect(
            above(screen.getByText("Team"), screen.getByRole("heading", { level: 2, name: "Meet the 2026 Team" }))
        ).toBe(true);
        expect(
            above(screen.getByText("Committees"), screen.getByRole("heading", { level: 2, name: "Committee Opportunities" }))
        ).toBe(true);
    });

    test("renders twelve explicit year pills with 2026 pressed by default", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        const filter = screen.getByRole("group", { name: "Team year" });
        const pills = within(filter).getAllByRole("button");
        expect(pills).toHaveLength(12);
        expect(pills.map((pill) => pill.textContent)).toEqual(allYears);
        expect(within(filter).getByRole("button", { name: "2026" })).toHaveAttribute("aria-pressed", "true");
        expect(within(filter).getByRole("button", { name: "2025" })).toHaveAttribute("aria-pressed", "false");
    });

    test("selecting the 2025 pill swaps the roster and heading to the 2025 team", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        fireEvent.click(screen.getByRole("button", { name: "2025" }));
        expect(screen.getByRole("heading", { level: 2, name: "Meet the 2025 Team" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "2025" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("button", { name: "2026" })).toHaveAttribute("aria-pressed", "false");

        const names2025 = team_2025[groupType.OFFICERS].map((officer) => officer.name);
        const officerNames = screen
            .getAllByRole("heading", { level: 3 })
            .map((heading) => heading.textContent)
            .filter((name) => names2025.includes(name));
        expect(officerNames).toEqual(names2025);
        const yearOnly2026 = approvedNames.filter((name) => !names2025.includes(name));
        yearOnly2026.forEach((name) =>
            expect(screen.queryByRole("heading", { level: 3, name })).not.toBeInTheDocument()
        );
    });

    test("year filtering leaves committee opportunities fixed", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        fireEvent.click(screen.getByRole("button", { name: "2025" }));
        expect(screen.getByRole("heading", { level: 2, name: "Committee Opportunities" })).toBeInTheDocument();
        expect(screen.getAllByText(/membership open/i)).toHaveLength(2);
        expect(screen.getAllByRole("link", { name: /join .* committee/i })).toHaveLength(2);
    });

    test("page content never mentions elections or an election FAQ", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        expect(screen.queryByRole("heading", { name: /elections?/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/faq/i)).not.toBeInTheDocument();
    });
});

describe("App /get-involved route", () => {
    test("serves the Get Involved page within the app shell", () => {
        renderAppAtGetInvolved();
        expect(screen.getByRole("heading", { level: 1, name: "Get Involved" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 2, name: "Meet the 2026 Team" })).toBeInTheDocument();
        for (const name of approvedNames) {
            expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
        }
    });

    test("does not render Elections or Election FAQ content on the route", () => {
        renderAppAtGetInvolved();
        expect(screen.queryByRole("heading", { name: /elections/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: /election faq/i })).not.toBeInTheDocument();
    });
});
