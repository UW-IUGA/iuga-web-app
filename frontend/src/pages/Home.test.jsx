import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import HomePage from "./Home";

// EventCard formats dates with the ESM-only "dateformat" package, which jest
// cannot transform inside node_modules; a factory mock keeps the card's
// rendering path exercised without parsing that module.
vi.mock("dateformat", () => ({ default: () => "Mar 01" }));

const renderHome = () =>
    render(
        <MemoryRouter initialEntries={["/"]}>
            <Routes>
                <Route path="/" element={<HomePage upcomingEvents={[]} />} />
                <Route path="/get-involved" element={<div>Get Involved Page</div>} />
                <Route path="/events" element={<div>Events Page</div>} />
            </Routes>
        </MemoryRouter>
    );

describe("HomePage", () => {
    test("renders the landing-page hero region", () => {
        renderHome();

        expect(screen.getByRole("region", { name: /Informatics Undergraduate Association/i })).toBeInTheDocument();
    });

    test("explains the student gateway in the hero subheadline", () => {
        renderHome();

        expect(screen.getByText(/events, resources, opportunities, and community/i)).toBeInTheDocument();
    });

    test("keeps the primary event route accessible", async () => {
        renderHome();

        await userEvent.click(screen.getByRole("link", { name: /Explore Events/ }));
        expect(screen.getByText("Events Page")).toBeInTheDocument();
    });

    test("exposes category paths and homepage shortcuts", () => {
        renderHome();

        expect(screen.getByRole("navigation", { name: /interest tags/i })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Career tag/i })).toHaveAttribute("href", "/events");
        expect(screen.getByRole("link", { name: /Academic tag/i })).toHaveAttribute("href", "/events");
        expect(screen.getByRole("link", { name: /Social tag/i })).toHaveAttribute("href", "/events");
        expect(screen.getByRole("link", { name: /Join IUGA/ })).toHaveAttribute("href", "/get-involved");
        expect(screen.getByRole("link", { name: /Shop merch/ })).toHaveAttribute("href", "/get-involved");
    });

    test("presents all three interest tags as equal-priority destinations", () => {
        renderHome();

        const tagLinks = screen.getByRole("navigation", { name: /interest tags/i }).querySelectorAll("a");

        expect(tagLinks).toHaveLength(3);
        expect([...tagLinks].map((link) => link.textContent)).toEqual(["Career", "Academic", "Social"]);
    });

    test("makes Happening This Week a direct event destination", () => {
        renderHome();

        expect(screen.getByRole("link", { name: /Happening this week/i })).toHaveAttribute("href", "/events");
    });

    test("prioritizes the event destination before the group photo", () => {
        renderHome();

        const eventCard = screen.getByRole("link", { name: /Happening this week/i });
        const groupPhoto = screen.getByAltText("IUGA members at iFormal 2026");

        expect(eventCard.compareDocumentPosition(groupPhoto) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    test("has no form inputs and no disabled Coming Soon submit", () => {
        renderHome();
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.queryByText(/send.*coming soon/i)).not.toBeInTheDocument();
    });

    test("uses descriptive alternatives for hero images", () => {
        renderHome();

        expect(screen.getByAltText("IUGA members at iFormal 2026")).toBeInTheDocument();
        expect(screen.getByAltText("IUGA members forming a heart")).toBeInTheDocument();
        expect(screen.getByAltText("IUGA bowling night")).toBeInTheDocument();
    });
});
