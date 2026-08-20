import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import HomePage from "./Home";

// EventCard formats dates with the ESM-only "dateformat" package, which jest
// cannot transform inside node_modules; a factory mock keeps the card's
// rendering path exercised without parsing that module.
jest.mock("dateformat", () => (date, mask) => "Mar 01");

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

        expect(screen.getByRole("region", { name: /By informatics students, for informatics students/i })).toBeInTheDocument();
    });

    test("keeps the primary event route accessible", async () => {
        renderHome();

        await userEvent.click(screen.getByRole("link", { name: /Explore Events/ }));
        expect(screen.getByText("Events Page")).toBeInTheDocument();
    });

    test("keeps the involvement route accessible from the hero", async () => {
        renderHome();
        await userEvent.click(screen.getByRole("link", { name: /Join IUGA/ }));
        expect(screen.getByText("Get Involved Page")).toBeInTheDocument();
    });

    test("exposes category paths and compact secondary actions", () => {
        renderHome();

        expect(screen.getByRole("link", { name: /Career/ })).toHaveAttribute("href", "/events");
        expect(screen.getByRole("link", { name: /Academic/ })).toHaveAttribute("href", "/events");
        expect(screen.getByRole("link", { name: /Social/ })).toHaveAttribute("href", "/events");
        expect(screen.getByRole("link", { name: /Join IUGA/ })).toHaveAttribute("href", "/get-involved");
        expect(screen.getByRole("link", { name: /Shop merch/ })).toHaveAttribute("href", "/get-involved");
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
        expect(screen.getAllByAltText("IUGA branded merchandise arranged for students").length).toBeGreaterThan(0);
    });
});
