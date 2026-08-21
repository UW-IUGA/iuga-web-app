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
                <Route path="/shop" element={<div>Shop Page</div>} />
            </Routes>
        </MemoryRouter>
    );

describe("HomePage", () => {
    test("renders the landing-page hero region", () => {
        renderHome();

        expect(screen.getByRole("region", { name: /Informatics Undergraduate Association/i })).toBeInTheDocument();
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
        expect(screen.getByRole("link", { name: /Shop merch/ })).toHaveAttribute("href", "/shop");
    });

    test("provides a contact form for student, faculty, and professional inquiries", () => {
        renderHome();
        expect(screen.getByRole("heading", { name: "Get in touch" })).toBeInTheDocument();
        expect(screen.getByLabelText("Name")).toBeInTheDocument();
        expect(screen.getByLabelText("Email")).toBeInTheDocument();
        expect(screen.getByLabelText("Inquiry type")).toBeInTheDocument();
        expect(screen.getByLabelText("Your message")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "iuga@uw.edu" })).toHaveAttribute("href", "mailto:iuga@uw.edu");
    });

    test("submits a contact message through the API", async () => {
        const originalFetch = global.fetch;
        const fetchMock = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "success" }),
        });
        global.fetch = fetchMock;

        try {
            renderHome();

            await userEvent.type(screen.getByLabelText("Name"), "Avery Chen");
            await userEvent.type(screen.getByLabelText("Email"), "avery@example.com");
            await userEvent.selectOptions(screen.getByLabelText("Inquiry type"), "Student");
            await userEvent.type(screen.getByLabelText("Your message"), "I would like to learn more about IUGA.");
            await userEvent.click(screen.getByRole("button", { name: "Send message" }));

            expect(await screen.findByText("Thanks — your message has been sent.")).toBeInTheDocument();
            expect(fetchMock).toHaveBeenCalledWith("/api/v1/contact", expect.objectContaining({
                method: "POST",
                headers: { "Content-Type": "application/json" },
            }));
        } finally {
            global.fetch = originalFetch;
        }
    });

    test("uses descriptive alternatives for hero images", () => {
        renderHome();

        expect(screen.getByAltText("IUGA members at iFormal 2026")).toBeInTheDocument();
        expect(screen.getByAltText("IUGA members forming a heart")).toBeInTheDocument();
        expect(screen.getByAltText("IUGA bowling night")).toBeInTheDocument();
        expect(screen.getAllByAltText("IUGA branded merchandise arranged for students").length).toBeGreaterThan(0);
    });
});
