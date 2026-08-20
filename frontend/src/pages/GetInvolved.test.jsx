import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import GetInvolvedPage from "./GetInvolved";
import { iugaTeams } from "../assets/data/AboutData";
import { useAuthContext } from "../context/AuthContext";

jest.mock("../context/AuthContext", () => ({
    useAuthContext: jest.fn(),
}));

// App imports Home -> EventStream -> EventCard, which formats dates with the
// ESM-only "dateformat" package jest cannot transform; the same factory mock
// used by EventStream.test.jsx keeps the import chain intact.
jest.mock("dateformat", () => (date, mask) => "Mar 01");

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

    test("renders only committee join links", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        expect(screen.getAllByRole("link", { name: /join .* committee/i })).toHaveLength(2);
        expect(screen.queryByRole("heading", { name: /meet the .* team/i })).not.toBeInTheDocument();
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

    test("renders an editorial kicker above the Committees heading", () => {
        render(<GetInvolvedPage teams={iugaTeams} />);
        expect(screen.getByText("Committees")).toBeInTheDocument();
        expect(
            above(screen.getByText("Committees"), screen.getByRole("heading", { level: 2, name: "Committee Opportunities" }))
        ).toBe(true);
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
        expect(screen.getByRole("heading", { level: 2, name: "Committee Opportunities" })).toBeInTheDocument();
    });

    test("does not render Elections or Election FAQ content on the route", () => {
        renderAppAtGetInvolved();
        expect(screen.queryByRole("heading", { name: /elections/i })).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: /election faq/i })).not.toBeInTheDocument();
    });
});
