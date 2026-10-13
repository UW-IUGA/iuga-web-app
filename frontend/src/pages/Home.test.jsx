import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import HomePage from "./Home";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days) => new Date(Date.now() + days * DAY_IN_MS).toISOString();

const renderHome = (upcomingEvents = []) =>
    render(
        <MemoryRouter initialEntries={["/"]}>
            <Routes>
                <Route path="/" element={<HomePage upcomingEvents={upcomingEvents} />} />
                <Route path="/get-involved" element={<div>Get Involved Page</div>} />
                <Route path="/events" element={<div>Events Page</div>} />
            </Routes>
        </MemoryRouter>
    );

describe("HomePage", () => {
    test("keeps the primary event route accessible", async () => {
        renderHome();

        await userEvent.click(screen.getByRole("link", { name: "Explore events" }));
        expect(screen.getByText("Events Page")).toBeInTheDocument();
    });

    test("lists the three soonest future events in date order", () => {
        renderHome([
            { eName: "Later event", eStartDate: daysFromNow(9) },
            { eName: "Past event", eStartDate: daysFromNow(-2) },
            { eName: "Soonest event", eStartDate: daysFromNow(1) },
            { eName: "Middle event", eStartDate: daysFromNow(4) },
            { eName: "Fourth event", eStartDate: daysFromNow(12) },
        ]);

        const eventTitles = within(screen.getByRole("list"))
            .getAllByRole("heading", { level: 3 })
            .map((heading) => heading.textContent);

        expect(eventTitles).toEqual(["Soonest event", "Middle event", "Later event"]);
    });

    test("points to the calendar when no future events are scheduled", () => {
        renderHome([{ eName: "Past event", eStartDate: daysFromNow(-2) }]);

        expect(screen.queryByRole("list")).not.toBeInTheDocument();
        expect(screen.getByRole("link", { name: /New dates are on the way/ })).toHaveAttribute("href", "/events");
    });

    test("links each informatics destination to its page", () => {
        renderHome();

        expect(screen.getByRole("link", { name: /Student organizations/ })).toHaveAttribute("href", "/resources?category=Community");
        expect(screen.getByRole("link", { name: /^Resources/ })).toHaveAttribute("href", "/resources");
        expect(screen.getByRole("link", { name: /^Student Voice/ })).toHaveAttribute("href", "/student-voice");
        expect(screen.getByRole("link", { name: /^About IUGA/ })).toHaveAttribute("href", "/about");
    });

    test("sends the community photos to get involved and shop", () => {
        renderHome();

        const communityLinks = screen.getByRole("region", { name: "Community links" });
        expect(within(communityLinks).getByRole("link", { name: "Get involved" })).toHaveAttribute("href", "/get-involved");
        expect(within(communityLinks).getByRole("link", { name: "Shop" })).toHaveAttribute("href", "/shop");
    });
});
