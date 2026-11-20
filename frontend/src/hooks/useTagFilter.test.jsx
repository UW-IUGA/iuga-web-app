import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import useTagFilter from "./useTagFilter";

// The hook under a router opened at `entry`, alongside the router's own view of
// the URL and how it last got there, so a test can read what was written.
function setup(entry = "/events") {
    const wrapper = ({ children }) => <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>;
    const rendered = renderHook(
        () => ({ ...useTagFilter(), location: useLocation(), navigationType: useNavigationType() }),
        { wrapper },
    );
    const written = () => new URLSearchParams(rendered.result.current.location.search);
    return { ...rendered, written };
}

afterEach(cleanup);

describe("useTagFilter", () => {
    it("shows every tag by default", () => {
        const { result } = setup();

        expect(result.current.shownTags).toEqual(["Academic", "Career", "Social"]);
        expect(result.current.isFiltered).toBe(false);
    });

    it("reads the shown tags out of the URL, in any case, ignoring names it does not know", () => {
        const { result } = setup("/events?tags=SOCIAL,workshop,academic");

        expect(result.current.shownTags).toEqual(["Academic", "Social"]);
        expect(result.current.isTagShown("Career")).toBe(false);
        expect(result.current.isFiltered).toBe(true);
    });

    it("turns a tag off by writing the ones left on, replacing the history entry", () => {
        const { result, written } = setup("/events?view=week&date=2026-10-20");

        act(() => result.current.toggleTag("Social"));

        expect(written().get("tags")).toBe("academic,career");
        expect(result.current.navigationType).toBe("REPLACE");
        // The view and date stay as they were.
        expect(written().get("view")).toBe("week");
        expect(written().get("date")).toBe("2026-10-20");
    });

    it("turns a tag back on in the legend's order", () => {
        const { result, written } = setup("/events?tags=social");

        act(() => result.current.toggleTag("Academic"));

        expect(written().get("tags")).toBe("academic,social");
    });

    it("leaves the parameter out once every tag is on again", () => {
        const { result, written } = setup("/events?tags=academic,social");

        act(() => result.current.toggleTag("Career"));

        expect(written().has("tags")).toBe(false);
        expect(result.current.isFiltered).toBe(false);
    });

    it("keeps an empty filter when every tag is turned off, and Show all brings them back", () => {
        const { result, written } = setup("/events?tags=social");

        act(() => result.current.toggleTag("Social"));
        expect(written().get("tags")).toBe("");
        expect(result.current.shownTags).toEqual([]);

        act(() => result.current.showAllTags());
        expect(written().has("tags")).toBe(false);
    });

    it("keeps the same list between renders while the URL is unchanged", () => {
        const { result, rerender } = setup("/events?tags=social");
        const first = result.current.shownTags;

        rerender();

        expect(result.current.shownTags).toBe(first);
    });
});
