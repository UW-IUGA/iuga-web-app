import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { normalizeEvent } from "../../utils/calendar/calendar";
import DayView from "./DayView";

// Thu Oct 22 2026, 1pm Pacific.
const anchor = () => new Date("2026-10-22T20:00:00.000Z");

const rich = () =>
    normalizeEvent({
        eId: "panel",
        eName: "Industry Panel",
        eStartDate: "2026-10-22T17:00:00Z",
        eEndDate: "2026-10-22T19:00:00Z",
        eDescription: "Designers from TikTok and Expedia share their journeys.",
        eLocation: "HUB332",
        eOrganizers: "IUGA x HCDEsa",
        eLabels: ["Career"],
        eAltLink: { title: "Event page", url: "https://example.com/panel" },
        participants: 42,
        showParticipants: true,
        rsvpEnabled: true,
        rsvpQuestions: [{ qId: "q1", qString: "Any dietary restrictions?" }],
    });

function renderDay({ events = [], onSelectDay = vi.fn() } = {}) {
    return {
        onSelectDay,
        ...render(<DayView anchor={anchor()} events={events} onSelectDay={onSelectDay} />),
    };
}

afterEach(cleanup);

describe("DayView", () => {
    it("renders the grid as a single column", () => {
        const { container } = renderDay();

        expect(container.querySelectorAll(".grid__col")).toHaveLength(1);
        expect(container.querySelectorAll(".grid__dayhead")).toHaveLength(1);
    });

    it("heads the agenda with the full date of the day", () => {
        renderDay();

        expect(screen.getByRole("heading", { name: "Thursday, October 22, 2026" })).toBeTruthy();
        expect(screen.getByRole("region", { name: "Thursday, October 22, 2026" })).toBeTruthy();
    });

    it("says so when the day is empty", () => {
        renderDay();

        expect(screen.getByText("Nothing scheduled.")).toBeTruthy();
    });

    it("renders each event of the day", () => {
        const { container } = renderDay({
            events: [
                rich(),
                normalizeEvent({
                    eId: "jam",
                    eName: "Study Jam",
                    eStartDate: "2026-10-22T21:00:00Z",
                    eEndDate: "2026-10-22T22:30:00Z",
                }),
            ],
        });

        expect(container.querySelectorAll(".detail")).toHaveLength(2);
    });

    it("shows the event name and full description", () => {
        renderDay({ events: [rich()] });

        expect(screen.getByRole("heading", { name: "Industry Panel" })).toBeTruthy();
        expect(screen.getByText(/TikTok and Expedia/)).toBeTruthy();
    });

    it("shows location and organizers", () => {
        renderDay({ events: [rich()] });

        expect(screen.getByText("HUB332")).toBeTruthy();
        expect(screen.getByText("IUGA x HCDEsa")).toBeTruthy();
    });

    it("links out when the source carries an alt link", () => {
        renderDay({ events: [rich()] });

        const link = screen.getByRole("link", { name: "Event page" });
        expect(link.getAttribute("href")).toBe("https://example.com/panel");
    });

    it("reports the attendance count", () => {
        renderDay({ events: [rich()] });

        expect(screen.getByText("42")).toBeTruthy();
    });

    it("lists RSVP questions when the event asks any", () => {
        renderDay({ events: [rich()] });

        expect(screen.getByText("Any dietary restrictions?")).toBeTruthy();
    });

    it("omits meta rows the source did not fill in", () => {
        renderDay({
            events: [
                normalizeEvent({
                    eId: "plain",
                    eName: "Bare event",
                    eStartDate: "2026-10-22T17:00:00Z",
                    eEndDate: "2026-10-22T18:00:00Z",
                }),
            ],
        });

        expect(screen.queryByText("Location")).toBeNull();
        expect(screen.queryByText("Organizers")).toBeNull();
        expect(screen.queryByText("RSVP")).toBeNull();
    });

    it("renders the label chips, showing Career as Professional", () => {
        const { container } = renderDay({ events: [rich()] });

        expect(container.querySelector(".detail__chip").textContent).toBe("Professional");
    });

    it("ignores an event from another day", () => {
        renderDay({
            events: [
                normalizeEvent({
                    eId: "other",
                    eName: "Some other day",
                    eStartDate: "2026-10-25T17:00:00Z",
                    eEndDate: "2026-10-25T18:00:00Z",
                }),
            ],
        });

        expect(screen.queryByText("Some other day")).toBeNull();
        expect(screen.getByText("Nothing scheduled.")).toBeTruthy();
    });
});
