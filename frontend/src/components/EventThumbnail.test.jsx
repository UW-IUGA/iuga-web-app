/*
Purpose: What an event shows in its thumbnail slot: its photo, or a contour drawing when it has none.
Expected Request Information: Event records as the event list returns them.
Expected Response Information: The rendered thumbnail.
*/
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import EventThumbnail from "./EventThumbnail";

const event = (fields) => ({ eId: "662488756c91a19331137491", eName: "Game Night", eLabels: ["Social"], ...fields });

describe("EventThumbnail", () => {
    test("an event with a photo shows the photo", () => {
        const { container } = render(<EventThumbnail event={event({ eThumbnailPath: "/assets/events/game-night.webp" })} />);

        expect(container.querySelector("img")).toHaveAttribute("src", "/assets/events/game-night.webp");
        expect(container.querySelector(".contourCover")).not.toBeInTheDocument();
    });

    test("an event without a photo shows a decorative contour drawing in its category colour", () => {
        const { container } = render(<EventThumbnail event={event()} />);
        const cover = container.querySelector(".contourCover");

        expect(container.querySelector("img")).not.toBeInTheDocument();
        expect(cover).toHaveAttribute("aria-hidden", "true");
        expect(cover).toHaveClass("contourCover--social");
        expect(cover.querySelectorAll("path").length).toBeGreaterThan(0);
    });

    test("the same event draws the same contours every time", () => {
        const first = render(<EventThumbnail event={event()} />).container.innerHTML;
        const second = render(<EventThumbnail event={event()} />).container.innerHTML;
        const other = render(<EventThumbnail event={event({ eId: "6624894e8bc2dc963685744b" })} />).container.innerHTML;

        expect(second).toBe(first);
        expect(other).not.toBe(first);
    });
});
