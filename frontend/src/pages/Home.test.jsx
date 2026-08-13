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
    test("hero Get Involved control navigates to /get-involved", async () => {
        renderHome();
        await userEvent.click(screen.getByRole("button", { name: "Get Involved" }));
        expect(screen.getByText("Get Involved Page")).toBeInTheDocument();
    });

    test("View All Events navigates to the events page", async () => {
        renderHome();
        await userEvent.click(screen.getByRole("button", { name: "View All Events" }));
        expect(screen.getByText("Events Page")).toBeInTheDocument();
    });

    test("has no form inputs and no disabled Coming Soon submit", () => {
        renderHome();
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.queryByText(/send.*coming soon/i)).not.toBeInTheDocument();
    });

    test("keeps the three IUGA function streams easy to scan", () => {
        renderHome();

        ["Academic", "Social", "Professional"].forEach((category) => {
            expect(screen.getByText(category)).toBeVisible();
            expect(screen.queryByRole("button", { name: category })).not.toBeInTheDocument();
        });

        [
            "Learn together, grow together",
            "Show up, connect, unwind",
            "Meet the people who make it",
        ].forEach((title) => {
            expect(screen.getByRole("heading", { name: title, level: 2 })).toBeVisible();
        });
    });
});
