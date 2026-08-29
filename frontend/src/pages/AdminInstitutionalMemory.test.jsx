import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import AdminCharter from "./AdminCharter";
import AdminJournal from "./AdminJournal";
import { useAuthContext } from "../context/AuthContext";
import { adminRequest } from "../utils/adminApi";

vi.mock("../components/AdminRoute", () => ({ default: ({ children }) => children }));
vi.mock("../context/AuthContext", () => ({ useAuthContext: vi.fn() }));
vi.mock("../utils/adminApi", () => ({ adminRequest: vi.fn() }));

describe("admin institutional memory pages", () => {
    beforeEach(() => {
        useAuthContext.mockReturnValue({
            user: { _id: "507f1f77bcf86cd799439011" },
            can: (permission) => ["charter.read", "journal.read", "journal.create", "journal.edit_own"].includes(permission),
        });
        adminRequest.mockReset();
    });

    test("deep-links charter sections and shows read-only content", async () => {
        adminRequest.mockResolvedValue({ sections: [{ sectionKey: "elections", title: "Elections", content: "Election guidance" }] });

        render(<MemoryRouter><AdminCharter /></MemoryRouter>);

        expect(await screen.findByText("Election guidance")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Elections" })).toHaveAttribute("href", "#elections");
        expect(screen.getByText("Election guidance")).toHaveClass("adminMemoryContent");
    });

    test("lets the journal author edit their own entry", async () => {
        adminRequest.mockResolvedValue({
            entries: [{
                _id: "507f1f77bcf86cd799439014",
                authorId: { _id: "507f1f77bcf86cd799439011" },
                entryDate: "2026-08-28T00:00:00.000Z",
                body: "Original note",
                tags: ["advising"],
            }],
        });

        render(<AdminJournal />);

        expect(await screen.findByText("Original note")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));

        expect(screen.getByRole("heading", { name: "Edit journal entry" })).toBeInTheDocument();
        expect(screen.getByDisplayValue("Original note")).toBeInTheDocument();
    });

    test("submits a journal edit through the own-entry endpoint", async () => {
        adminRequest
            .mockResolvedValueOnce({ entries: [{
                _id: "507f1f77bcf86cd799439014",
                authorId: { _id: "507f1f77bcf86cd799439011" },
                entryDate: "2026-08-28T00:00:00.000Z",
                body: "Original note",
                tags: [],
            }] })
            .mockResolvedValueOnce({ entry: {
                _id: "507f1f77bcf86cd799439014",
                authorId: "507f1f77bcf86cd799439011",
                entryDate: "2026-08-28T00:00:00.000Z",
                body: "Updated note",
                tags: [],
            } });

        render(<AdminJournal />);
        await screen.findByText("Original note");
        fireEvent.click(screen.getByRole("button", { name: "Edit" }));
        fireEvent.change(screen.getByDisplayValue("Original note"), { target: { value: "Updated note" } });
        fireEvent.click(screen.getByRole("button", { name: "Update journal entry" }));

        await waitFor(() => expect(adminRequest).toHaveBeenLastCalledWith("journal/507f1f77bcf86cd799439014", expect.objectContaining({ method: "PATCH" })));
        expect(await screen.findByText("Updated note")).toBeInTheDocument();
    });
});
