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
            </Routes>
        </MemoryRouter>
    );

describe("HomePage", () => {
    test("hero Get Involved control navigates to /get-involved", async () => {
        renderHome();
        await userEvent.click(screen.getByRole("button", { name: "Get Involved" }));
        expect(screen.getByText("Get Involved Page")).toBeInTheDocument();
    });

    test("has no form inputs and no disabled Coming Soon submit", () => {
        renderHome();
        expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
        expect(screen.queryByText(/send.*coming soon/i)).not.toBeInTheDocument();
    });

    test("renders all three function category labels", () => {
        renderHome();
        expect(screen.getByText("Academic")).toBeInTheDocument();
        expect(screen.getByText("Social")).toBeInTheDocument();
        expect(screen.getByText("Professional")).toBeInTheDocument();
    });
});
