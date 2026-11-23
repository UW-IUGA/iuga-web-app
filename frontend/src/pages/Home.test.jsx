import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import HomePage from "./Home";

let production = false;
vi.mock("../runtime", () => ({
  get isProduction() {
    return production;
  },
  apiBaseUrl: "",
}));

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  production = false;
  vi.restoreAllMocks();
});

const renderHome = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/get-involved" element={<div>Get Involved Page</div>} />
        <Route path="/events" element={<div>Events Page</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("HomePage", () => {
  test("shows an event after retrying a failed list request", async () => {
    production = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: "Unavailable",
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            eId: "game-night",
            eName: "Game Night",
            eStartDate: "2024-04-04T20:30:00Z",
          },
        ],
      });

    renderHome();
    expect(screen.getByRole("status")).toHaveTextContent("Loading events…");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load events.",
    );

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("link", { name: /Game Night/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  test("links each informatics destination to its page", () => {
    renderHome();

    expect(screen.getByRole("link", { name: /RSOs/ })).toHaveAttribute(
      "href",
      "/resources?tags=Student+clubs",
    );
    expect(screen.getByRole("link", { name: /^Resources/ })).toHaveAttribute(
      "href",
      "/resources",
    );
    expect(
      screen.queryByRole("link", { name: /^Student Voice/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Merch/ })).toHaveAttribute(
      "href",
      "/shop",
    );
    expect(screen.getByRole("link", { name: /^About IUGA/ })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(screen.getByRole("link", { name: /^Get involved/ })).toHaveAttribute(
      "href",
      "/get-involved",
    );
  });
});
