/*
Purpose: The top of an event's detail in the calendar: its photo, or a contour banner when it has none.
Expected Request Information: Event records normalised for the calendar.
Expected Response Information: The rendered detail, outside the RSVP provider.
*/
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { normalizeEvent } from "../../utils/calendar/calendar";
import EventDetail from "./EventDetail";

const listed = (fields) =>
    normalizeEvent({
        eId: "662450848a5036a39183aa2e",
        eName: "Industry Panel",
        eStartDate: "2026-11-25T02:00:00.000Z",
        eLabels: ["Career"],
        ...fields,
    });

describe("EventDetail cover", () => {
    test("an event with a photo shows the photo and no contour banner", () => {
        const { container } = render(<EventDetail event={listed({ eThumbnailPath: "/assets/events/panel.webp" })} />);

        expect(container.querySelector(".detail__photo")).toHaveAttribute("src", "/assets/events/panel.webp");
        expect(container.querySelector(".contourCover")).not.toBeInTheDocument();
    });

    test("an event without a photo shows a decorative contour banner in its category colour", () => {
        const { container } = render(<EventDetail event={listed()} />);
        const banner = container.querySelector(".contourCover");

        expect(container.querySelector(".detail__photo")).not.toBeInTheDocument();
        expect(banner).toHaveAttribute("aria-hidden", "true");
        expect(banner).toHaveClass("contourCover--career");
    });
});
