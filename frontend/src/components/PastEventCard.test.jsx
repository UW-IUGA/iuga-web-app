import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PastEventCard from "./PastEventCard";

const makeEvent = (photoCount) => ({
    id: "rso-fair",
    name: "RSO Fair",
    summary: "Student organizations met new members.",
    photos: Array.from({ length: photoCount }, (_, position) => ({
        src: `photo-${position}.jpg`,
        alt: `Photo ${position}`,
    })),
});

describe("PastEventCard", () => {
    test("shows the cover and up to four more photos, counting the rest", () => {
        render(<PastEventCard event={makeEvent(9)} onOpenPhoto={vi.fn()} />);

        expect(screen.getAllByRole("button", { name: /^Open photo/ })).toHaveLength(5);
        expect(screen.getByText("+4")).toBeInTheDocument();
    });

    test("shows no count when every photo fits", () => {
        render(<PastEventCard event={makeEvent(4)} onOpenPhoto={vi.fn()} />);

        expect(screen.getAllByRole("button", { name: /^Open photo/ })).toHaveLength(4);
        expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    });

    test("each photo opens the viewer at its own position", () => {
        const onOpenPhoto = vi.fn();
        render(<PastEventCard event={makeEvent(9)} onOpenPhoto={onOpenPhoto} />);

        fireEvent.click(screen.getByRole("button", { name: "Open photo: Photo 0" }));
        fireEvent.click(screen.getByRole("button", { name: "Open photo: Photo 3" }));

        expect(onOpenPhoto.mock.calls).toEqual([[0], [3]]);
    });

    test("View Photos opens the viewer at the first photo", () => {
        const onOpenPhoto = vi.fn();
        render(<PastEventCard event={makeEvent(9)} onOpenPhoto={onOpenPhoto} />);

        fireEvent.click(screen.getByRole("button", { name: "View Photos" }));

        expect(onOpenPhoto).toHaveBeenCalledWith(0);
    });

    test("draws View Photos as the site's filled pill unless the caller picks another style", () => {
        const { unmount } = render(<PastEventCard event={makeEvent(2)} onOpenPhoto={vi.fn()} />);
        expect(screen.getByRole("button", { name: "View Photos" })).toHaveClass("pill-button", "pill-button--fill");
        unmount();

        render(<PastEventCard event={makeEvent(2)} onOpenPhoto={vi.fn()} viewPhotosClassName="pastEvents__viewPhotos" />);
        const button = screen.getByRole("button", { name: "View Photos" });
        expect(button).toHaveClass("pastEventCard__viewPhotos", "pastEvents__viewPhotos");
        expect(button).not.toHaveClass("pill-button");
        expect(button).not.toHaveClass("pill-button--fill");
    });
});
