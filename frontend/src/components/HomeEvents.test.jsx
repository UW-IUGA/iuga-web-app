import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import HomeEvents from "./HomeEvents";

vi.mock("../runtime", () => ({ isProduction: true, apiBaseUrl: "" }));

const NOW = new Date(2026, 10, 19, 12);
const event = (eId, days) => ({
  eId,
  eName: `Event ${eId}`,
  eStartDate: new Date(2026, 10, 19 + days, 12).toISOString(),
  eLabels: ["Social"],
});
const listResponse = (records) => ({ ok: true, json: async () => records });

let fetchEvents;

beforeEach(() => {
  vi.setSystemTime(NOW);
  fetchEvents = vi.spyOn(global, "fetch");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderSection(records = []) {
  fetchEvents.mockResolvedValue(listResponse(records));
  render(
    <MemoryRouter>
      <HomeEvents />
    </MemoryRouter>,
  );
}

async function eventLinks() {
  const list = await screen.findByRole("list");
  return within(list).getAllByRole("link");
}

describe("HomeEvents", () => {
  test("shows only the three soonest upcoming events, in order", async () => {
    renderSection([
      event("past", -1),
      event("later", 9),
      event("soon", 1),
      event("mid", 4),
      event("last", 12),
    ]);

    const links = await eventLinks();
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/Event soon/);
    expect(links[1]).toHaveAccessibleName(/Event mid/);
    expect(links[2]).toHaveAccessibleName(/Event later/);
  });

  test("falls back to the latest past events, newest first", async () => {
    renderSection([
      event("old", -30),
      event("recent", -2),
      event("older", -10),
    ]);

    const links = await eventLinks();
    expect(
      screen.getByRole("heading", { name: "Latest events." }),
    ).toBeInTheDocument();
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAccessibleName(/Event recent/);
    expect(links[1]).toHaveAccessibleName(/Event older/);
    expect(links[2]).toHaveAccessibleName(/Event old/);
  });

  test("ignores events without a usable date", async () => {
    renderSection([{ eId: "x", eName: "Undated", eStartDate: "not a date" }]);

    expect(
      await screen.findByText("No events yet. Check back soon."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Undated/ }),
    ).not.toBeInTheDocument();
  });

  test("links a past event to its week and provides a link to the full calendar", async () => {
    renderSection([event("Game Night", -1)]);

    expect(
      await screen.findByRole("link", { name: /Game Night/ }),
    ).toHaveAttribute("href", "/events?view=week&date=2026-11-18");
    expect(
      screen.getByRole("link", { name: "Browse past events" }),
    ).toHaveAttribute("href", "/events");
  });

  test("says when there are no events at all", async () => {
    renderSection();

    expect(
      screen.getByRole("heading", { name: "Upcoming events." }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("No events yet. Check back soon."),
    ).toBeInTheDocument();
  });

  test("offers a retry after failure, without treating the failed request as an empty list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchEvents.mockRejectedValueOnce(new Error("Offline"));
    renderSection();
    expect(screen.getByRole("status")).toHaveTextContent("Loading events…");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load events.",
    );
    expect(
      screen.queryByText("No events yet. Check back soon."),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("No events yet. Check back soon."),
    ).toBeInTheDocument();
  });

  test("counts the upcoming events the calendar holds beyond the three shown", async () => {
    renderSection([1, 2, 3, 4, 5].map((day) => event(`Meetup ${day}`, day)));

    expect(
      await screen.findByRole("link", { name: "See all 5 upcoming events" }),
    ).toHaveAttribute("href", "/events");
  });
});
