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
    test("renders the approved landing-page regions in order", () => {
        renderHome();

        const regions = [
            screen.getByRole("region", { name: "Find your place in Informatics." }),
            screen.getByRole("region", { name: "Happening in Informatics" }),
            screen.getByRole("region", { name: "Community" }),
            screen.getByRole("region", { name: "Get Involved" }),
            screen.getByRole("region", { name: "Rep Informatics" }),
        ];

        expect(regions.map((region) => region.querySelector("h1, h2, h3").textContent)).toEqual([
            "Find your place in Informatics.",
            "Happening in Informatics",
            "Community",
            "Get Involved",
            "Rep Informatics",
        ]);
    });

    test("keeps the primary event route accessible", async () => {
        renderHome();

        await userEvent.click(screen.getByRole("link", { name: "Find an Event" }));
        expect(screen.getByText("Events Page")).toBeInTheDocument();
    });

    test("keeps the involvement route accessible from the hero", async () => {
        renderHome();
        await userEvent.click(screen.getByRole("link", { name: /Join IUGA/ }));
        expect(screen.getByText("Get Involved Page")).toBeInTheDocument();
    });

    test("exposes the three secondary hero paths", () => {
        renderHome();

        expect(screen.getByRole("link", { name: /Explore Community/ })).toHaveAttribute("href", "#community");
        expect(screen.getByRole("link", { name: /Join IUGA/ })).toHaveAttribute("href", "/get-involved");
        expect(screen.getByRole("link", { name: /Shop Merch/ })).toHaveAttribute("href", "#merch");
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

    test("uses descriptive alternatives for landing-page images", () => {
        renderHome();

        expect(screen.getByAltText("IUGA members at iFormal 2026")).toBeInTheDocument();
        expect(screen.getByAltText("IUGA members at a game night")).toBeInTheDocument();
        expect(screen.getByAltText("IUGA members gathered together")).toBeInTheDocument();
        expect(screen.getByAltText("IUGA officer team members representing Informatics")).toBeInTheDocument();
        expect(screen.getByAltText("IUGA branded merchandise arranged for students")).toBeInTheDocument();
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
            expect(screen.getByRole("heading", { name: title, level: 3 })).toBeVisible();
        });
    });
});
