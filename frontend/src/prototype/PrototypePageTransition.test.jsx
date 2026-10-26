/*
 * Purpose: The page stage around routed pages: a new page opens at the top with focus on its heading, animates
 *          once per page change, leaves query-only changes alone, and does nothing without a version.
 * Authentication/Authorization Requirements: None.
 * Expected Request Information: A version and in-app link clicks.
 * Expected Response Information: Focus, scroll, and animation calls.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { PrototypePageStage, usePrototypePageTransition } from "./PrototypePageTransition";
import { prototypeTransitionVersion, resetPrototypeTransitionVersion } from "./prototypePageTransitions";

function Shell() {
    const page = usePrototypePageTransition(useLocation());
    return (
        <>
            <nav>
                <Link to="/events">Events</Link>
                <Link to="/events?view=week">Week</Link>
                <Link to="/shop">Shop</Link>
            </nav>
            <PrototypePageStage transition={page.transition} stageRef={page.stageRef}>
                <Routes location={page.routesLocation}>
                    <Route path="/" element={<h1>Home</h1>} />
                    <Route path="/events" element={<h1>Events</h1>} />
                    <Route path="/shop" element={<h1>Shop</h1>} />
                </Routes>
            </PrototypePageStage>
        </>
    );
}

let animations;
function setUp(search, { reduced = false } = {}) {
    resetPrototypeTransitionVersion();
    prototypeTransitionVersion(search);
    window.matchMedia = (query) => ({ matches: reduced && query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} });
    window.scrollTo = vi.fn();
    animations = [];
    HTMLElement.prototype.animate = vi.fn(function animate(keyframes) {
        const animation = { keyframes, cancel: vi.fn() };
        animations.push(animation);
        return animation;
    });
    render(<MemoryRouter initialEntries={["/"]}><Shell /></MemoryRouter>);
}

afterEach(() => {
    cleanup();
    resetPrototypeTransitionVersion();
    delete window.matchMedia;
    delete HTMLElement.prototype.animate;
});

it("opens the new page at the top with focus on its heading, animating once", () => {
    setUp("?v=2");
    act(() => fireEvent.click(screen.getByText("Events")));

    expect(screen.getByRole("heading", { name: "Events" })).toHaveFocus();
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(animations).toHaveLength(1);
});

it("leaves query-only changes, like the calendar's views, alone", () => {
    setUp("?v=2");
    act(() => fireEvent.click(screen.getByText("Events")));
    const link = screen.getByText("Week");
    link.focus();
    act(() => fireEvent.click(link));

    expect(animations).toHaveLength(1);
    expect(link).toHaveFocus();
});

it("cancels a running entrance when another page is opened, so effects never stack", () => {
    setUp("?v=4");
    act(() => fireEvent.click(screen.getByText("Events")));
    act(() => fireEvent.click(screen.getByText("Shop")));

    expect(animations[0].cancel).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Shop" })).toHaveFocus();
});

it("swaps pages instantly under reduced motion, still moving focus", () => {
    setUp("?v=2", { reduced: true });
    act(() => fireEvent.click(screen.getByText("Shop")));

    expect(animations).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Shop" })).toHaveFocus();
});

it("changes nothing without a version", () => {
    setUp("");
    act(() => fireEvent.click(screen.getByText("Shop")));

    expect(screen.getByRole("heading", { name: "Shop" })).not.toHaveFocus();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.querySelector(".prototypePageStage")).toBeNull();
});
