/*
 * Purpose: Opening another page starts at its top, while changing only the query (a filter or a
 *          calendar view) keeps the visitor where they are.
 * Authentication/Authorization Requirements: None.
 * Expected Request Information: Navigation between routes.
 * Expected Response Information: Whether the window is scrolled to the top.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, useNavigate } from "react-router-dom";
import ScrollToTop from "./ScrollToTop";

function HistoryButtons() {
  const navigate = useNavigate();
  return (
    <>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ScrollToTop />
      <HistoryButtons />
      <Link to="/about">About</Link>
      <Link to="/resources?category=Career">Career resources</Link>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("scrolls to the top when the visitor opens another page", () => {
  renderAt("/resources");
  window.scrollTo.mockClear();

  fireEvent.click(screen.getByRole("link", { name: "About" }));

  expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
});

it("restores each page's scroll position on Back and Forward", () => {
  renderAt("/resources");
  const scrollY = vi.spyOn(window, "scrollY", "get");
  scrollY.mockReturnValue(600);
  fireEvent.scroll(window);
  fireEvent.click(screen.getByRole("link", { name: "About" }));

  scrollY.mockReturnValue(250);
  fireEvent.scroll(window);
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(window.scrollTo).toHaveBeenLastCalledWith(0, 600);

  fireEvent.click(screen.getByRole("button", { name: "Forward" }));
  expect(window.scrollTo).toHaveBeenLastCalledWith(0, 250);
});

it("keeps the scroll position when only the query changes", () => {
  renderAt("/resources");
  window.scrollTo.mockClear();

  fireEvent.click(screen.getByRole("link", { name: "Career resources" }));

  expect(window.scrollTo).not.toHaveBeenCalled();
});
