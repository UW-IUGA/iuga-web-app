import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import PastEvents from "./PastEvents";
import { pastEvents } from "../../assets/data/PastEventsData";

describe("PastEvents", () => {
    test("draws View Photos as the calendar's strong pill, not the site's filled pill", () => {
        render(<PastEvents />);

        const buttons = screen.getAllByRole("button", { name: "View Photos" });
        expect(buttons).toHaveLength(pastEvents.length);
        for (const button of buttons) {
            expect(button).toHaveClass("pastEvents__viewPhotos");
            expect(button).not.toHaveClass("pill-button");
        }
    });

    test("View Photos opens the viewer at the first photo of its event", () => {
        render(<PastEvents />);
        const [first] = pastEvents;

        fireEvent.click(screen.getAllByRole("button", { name: "View Photos" })[0]);

        const viewer = screen.getByRole("dialog", { name: `${first.name} photos` });
        expect(within(viewer).getByText(`1 / ${first.photos.length}`)).toBeInTheDocument();
    });
});
