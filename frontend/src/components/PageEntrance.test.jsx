/*
 * Purpose: Pages opt into the shared entrance wave through wrappers, without
 *          setting delay styles or the entering class themselves.
 * Expected Request Information: A page root, a grid or list of items, a hero,
 *          or an overlay, with a column map only when the items sit on a grid.
 * Expected Response Information: The entering class on a first visit, item
 *          delay variables that match the shared wave, and an overlay origin.
 */
import { createRef } from "react";
import { vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { act, render, screen } from "@testing-library/react";
import {
    EntranceGrid,
    EntranceHero,
    EntranceList,
    OverlayEntrance,
    PageRoot,
    usePageEntranceClass,
} from "./PageEntrance";
import { ENTRANCE_WAVE_MS, entranceGridOrder, resetPageEntranceForTests } from "../utils/pageEntrance";

const renderOnRoute = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
    resetPageEntranceForTests();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("PageRoot", () => {
    test("marks the page as entering on the first visit, then not on a later mount of the same key", () => {
        vi.useFakeTimers();
        const { unmount } = renderOnRoute(
            <PageRoot onceKey="shop" className="shopPage">
                Shop
            </PageRoot>
        );
        expect(screen.getByText("Shop")).toHaveClass("shopPage", "pageEntrance--enter");
        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS);
        });
        unmount();

        renderOnRoute(
            <PageRoot onceKey="shop" className="shopPage">
                Shop again
            </PageRoot>
        );
        expect(screen.getByText("Shop again")).toHaveClass("shopPage");
        expect(screen.getByText("Shop again")).not.toHaveClass("pageEntrance--enter");
    });
});

describe("EntranceGrid", () => {
    test("stamps each child with the shared grid wave, using the page's column map", () => {
        renderOnRoute(
            <EntranceGrid columns={{ 0: 2 }}>
                <article>One</article>
                <article>Two</article>
                <article>Three</article>
            </EntranceGrid>
        );
        const items = screen.getAllByRole("article");
        expect(items).toHaveLength(3);
        items.forEach((item) => expect(item).toHaveClass("pageEntrance__item"));
        const first = entranceGridOrder(0, 2);
        const third = entranceGridOrder(2, 2);
        expect(items[0].style.getPropertyValue("--entrance-i")).toBe(String(first["--entrance-i"]));
        expect(items[0].style.getPropertyValue("--entrance-row")).toBe(String(first["--entrance-row"]));
        expect(items[2].style.getPropertyValue("--entrance-i")).toBe(String(third["--entrance-i"]));
        expect(items[2].style.getPropertyValue("--entrance-row")).toBe(String(third["--entrance-row"]));
    });

    test("continues the wave when the page already rendered earlier items", () => {
        renderOnRoute(
            <EntranceGrid columns={{ 0: 1 }} startAt={2}>
                <article>Later</article>
            </EntranceGrid>
        );
        const item = screen.getByRole("article");
        expect(item.style.getPropertyValue("--entrance-i")).toBe(String(entranceGridOrder(2, 1)["--entrance-i"]));
        expect(item.style.getPropertyValue("--entrance-row")).toBe(String(entranceGridOrder(2, 1)["--entrance-row"]));
    });
});

describe("EntranceList", () => {
    test("stamps each child with the shared list wave", () => {
        renderOnRoute(
            <ul>
                <EntranceList>
                    <li>First</li>
                    <li>Second</li>
                </EntranceList>
            </ul>
        );
        const items = screen.getAllByRole("listitem");
        expect(items[0]).toHaveClass("pageEntrance__listItem");
        expect(items[0].style.getPropertyValue("--entrance-i")).toBe("0");
        expect(items[1].style.getPropertyValue("--entrance-i")).toBe("1");
    });
});

describe("EntranceHero", () => {
    test("marks a hero so it uses the shared hero beat, with an optional index", () => {
        const { rerender } = renderOnRoute(<EntranceHero className="poster">Hero</EntranceHero>);
        const hero = screen.getByText("Hero");
        expect(hero).toHaveClass("poster", "pageEntrance__hero");
        expect(hero.style.getPropertyValue("--entrance-i")).toBe("0");
        rerender(<EntranceHero className="poster" index={1}>Hero</EntranceHero>);
        expect(screen.getByText("Hero").style.getPropertyValue("--entrance-i")).toBe("1");
    });
});

describe("usePageEntranceClass", () => {
    test("returns the page class plus the entering class on a first visit only", () => {
        vi.useFakeTimers();
        function Probe() {
            const className = usePageEntranceClass("shopCheckout", { onceKey: "checkout-probe" });
            return <main className={className}>Checkout</main>;
        }
        const { unmount } = renderOnRoute(<Probe />);
        expect(screen.getByRole("main")).toHaveClass("shopCheckout", "pageEntrance--enter");
        act(() => {
            vi.advanceTimersByTime(ENTRANCE_WAVE_MS);
        });
        unmount();
        renderOnRoute(<Probe />);
        expect(screen.getByRole("main")).toHaveClass("shopCheckout");
        expect(screen.getByRole("main")).not.toHaveClass("pageEntrance--enter");
    });
});

describe("OverlayEntrance", () => {
    test("sets the origin and the leaving class from the trigger, not from page code", () => {
        const { rerender } = renderOnRoute(
            <OverlayEntrance origin={{ x: "12px", y: "40px" }}>Cart</OverlayEntrance>
        );
        const overlay = screen.getByText("Cart");
        expect(overlay).toHaveClass("overlayEntrance");
        expect(overlay).not.toHaveClass("overlayEntrance--leave");
        expect(overlay.style.getPropertyValue("--overlay-origin")).toBe("12px 40px");

        rerender(
            <OverlayEntrance origin={{ x: "12px", y: "40px" }} leaving>
                Cart
            </OverlayEntrance>
        );
        expect(screen.getByText("Cart")).toHaveClass("overlayEntrance", "overlayEntrance--leave");
    });

    test("forwards a ref to the overlay element, so a dialog can still open itself", () => {
        const ref = createRef();
        renderOnRoute(<OverlayEntrance as="dialog" ref={ref}>Hello</OverlayEntrance>);
        expect(ref.current).toBeInstanceOf(HTMLDialogElement);
        expect(ref.current).toHaveTextContent("Hello");
    });
});
