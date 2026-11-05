import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import CalendarControls from "./CalendarControls";

// Tue Oct 20 2026, 1pm Pacific.
const anchor = () => new Date("2026-10-20T20:00:00.000Z");

function renderCalendarControls({ mode = "month", ...rest } = {}) {
  const handlers = {
    onModeChange: vi.fn(),
    onToday: vi.fn(),
    onStep: vi.fn(),
    ...rest,
  };

  return {
    ...handlers,
    ...render(
      <CalendarControls mode={mode} selectedDate={anchor()} {...handlers} />,
    ),
  };
}

afterEach(cleanup);

describe("CalendarControls", () => {
  it("names the month in month view", () => {
    renderCalendarControls({ mode: "month" });

    expect(screen.getByText("October 2026")).toBeTruthy();
  });

  it("labels the archive rather than a year, since it does not step", () => {
    renderCalendarControls({ mode: "year" });

    expect(screen.getByText("All Events")).toBeTruthy();
    expect(screen.queryByText("2026")).toBeNull();
  });

  it("spans the week in week view", () => {
    renderCalendarControls({ mode: "week" });

    expect(screen.getByText("Oct 18 – Oct 24, 2026")).toBeTruthy();
  });

  it("names the single day in day view", () => {
    renderCalendarControls({ mode: "day" });

    expect(screen.getByText("Tue, Oct 20, 2026")).toBeTruthy();
  });

  it("names the arrows by the view's own unit", () => {
    for (const mode of ["month", "week", "day"]) {
      const { unmount } = renderCalendarControls({ mode });

      expect(
        screen.getByRole("button", { name: `Previous ${mode}` }),
      ).toBeTruthy();
      expect(screen.getByRole("button", { name: `Next ${mode}` })).toBeTruthy();
      unmount();
    }
  });

  it("reports a step back and a step forward", () => {
    const { onStep } = renderCalendarControls({ mode: "week" });

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));

    expect(onStep.mock.calls).toEqual([[-1], [1]]);
  });

  it("reports Today", () => {
    const { onToday } = renderCalendarControls({ mode: "month" });

    fireEvent.click(screen.getByRole("button", { name: "Today" }));

    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("offers no navigation in year view, which does not step", () => {
    renderCalendarControls({ mode: "year" });

    // The toggle's options are radios, so a plain button query finds none.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("names each colour in the legend, as a list", () => {
    renderCalendarControls();

    const legend = screen.getByRole("list", { name: "Event colours" });
    const items = within(legend).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Academic",
      "Career",
      "Social",
    ]);
    // Each swatch is decorative: the label beside it carries the meaning.
    for (const item of items) {
      const swatch = item.querySelector(".legend__swatch");
      expect(swatch.getAttribute("aria-hidden")).toBe("true");
      expect(swatch.style.backgroundColor).not.toBe("");
    }
  });

  it("offers all four views", () => {
    renderCalendarControls();

    const options = screen.getAllByRole("radio");
    expect(options.map((option) => option.textContent)).toEqual([
      "Year",
      "Month",
      "Week",
      "Day",
    ]);
  });

  it("marks only the current view as checked", () => {
    renderCalendarControls({ mode: "week" });

    const checked = screen
      .getAllByRole("radio")
      .filter((option) => option.getAttribute("aria-checked") === "true");

    expect(checked.map((option) => option.textContent)).toEqual(["Week"]);
  });

  it("reports a chosen view", () => {
    const { onModeChange } = renderCalendarControls({ mode: "month" });

    fireEvent.click(screen.getByRole("radio", { name: "Day" }));

    expect(onModeChange).toHaveBeenCalledWith("day");
  });

  describe("on a narrow screen", () => {
    it("offers the views as a labelled dropdown, on the current view", () => {
      renderCalendarControls({ mode: "week" });

      const select = screen.getByRole("combobox", { name: "Calendar view" });
      expect(select.value).toBe("week");
      expect([...select.options].map((option) => option.textContent)).toEqual([
        "Year",
        "Month",
        "Week",
        "Day",
      ]);
    });

    it("reports a view chosen from the dropdown", () => {
      const { onModeChange } = renderCalendarControls({ mode: "month" });

      fireEvent.change(
        screen.getByRole("combobox", { name: "Calendar view" }),
        {
          target: { value: "day" },
        },
      );

      expect(onModeChange).toHaveBeenCalledWith("day");
    });
  });
});
