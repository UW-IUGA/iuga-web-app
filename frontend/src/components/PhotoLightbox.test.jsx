import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PhotoLightbox from "./PhotoLightbox";

const photos = [
    { src: "one.jpg", alt: "First photo" },
    { src: "two.jpg", alt: "Second photo" },
    { src: "three.jpg", alt: "Third photo" },
];

const renderLightbox = (props = {}) => {
    const handlers = { onIndexChange: vi.fn(), onClose: vi.fn() };
    render(<PhotoLightbox photos={photos} index={0} title="RSO Fair" eyebrow="Tuesday, October 6" {...handlers} {...props} />);
    return handlers;
};

describe("PhotoLightbox", () => {
    test("stays closed without a photo to show", () => {
        renderLightbox({ index: null });

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("shows the chosen photo with its position, title, and eyebrow", () => {
        renderLightbox({ index: 1 });

        expect(screen.getByRole("dialog", { name: "RSO Fair photos" })).toBeInTheDocument();
        expect(screen.getByAltText("Second photo")).toHaveAttribute("src", "two.jpg");
        expect(screen.getByText("2 / 3")).toBeInTheDocument();
        expect(screen.getByText("RSO Fair")).toBeInTheDocument();
        expect(screen.getByText("Tuesday, October 6")).toBeInTheDocument();
    });

    test("the arrow buttons ask for the next and previous photo", () => {
        const { onIndexChange } = renderLightbox({ index: 1 });

        fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
        fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));

        expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
    });

    test("stepping past either end wraps around the set", () => {
        const first = renderLightbox({ index: 0 });
        fireEvent.click(screen.getByRole("button", { name: "Previous photo" }));
        expect(first.onIndexChange).toHaveBeenCalledWith(2);
    });

    test("the left and right arrow keys step through the photos", () => {
        const { onIndexChange } = renderLightbox({ index: 1 });
        const dialog = screen.getByRole("dialog");

        fireEvent.keyDown(dialog, { key: "ArrowRight" });
        fireEvent.keyDown(dialog, { key: "ArrowLeft" });

        expect(onIndexChange.mock.calls).toEqual([[2], [0]]);
    });

    test("a click outside the photo closes it once", () => {
        const { onClose } = renderLightbox();

        fireEvent.click(screen.getByRole("dialog"));

        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe("PhotoLightbox photo clicks", () => {
    // jsdom has no layout, so the photo is given a 400px-wide box starting at x=100.
    const clickPhotoAt = (clientX) => {
        const stage = screen.getByAltText("Second photo").parentElement;
        vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ left: 100, width: 400 });
        fireEvent.click(screen.getByAltText("Second photo"), { clientX });
    };

    test("a click on the right half of the photo asks for the next photo", () => {
        const { onIndexChange } = renderLightbox({ index: 1 });

        clickPhotoAt(301);

        expect(onIndexChange).toHaveBeenCalledWith(2);
    });

    test("a click on the left half of the photo asks for the previous photo", () => {
        const { onIndexChange } = renderLightbox({ index: 1 });

        clickPhotoAt(299);

        expect(onIndexChange).toHaveBeenCalledWith(0);
    });

    test("clicks on the photo wrap around at both ends", () => {
        const last = renderLightbox({ index: 2 });
        const lastStage = screen.getByAltText("Third photo").parentElement;
        vi.spyOn(lastStage, "getBoundingClientRect").mockReturnValue({ left: 100, width: 400 });
        fireEvent.click(screen.getByAltText("Third photo"), { clientX: 450 });

        expect(last.onIndexChange).toHaveBeenCalledWith(0);
    });

    test("the close button over the photo closes without changing the photo", () => {
        const { onIndexChange, onClose } = renderLightbox({ index: 1 });

        fireEvent.click(screen.getByRole("button", { name: "Close photos" }));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onIndexChange).not.toHaveBeenCalled();
    });

    test("the text over the photo counts as part of the photo", () => {
        const { onIndexChange } = renderLightbox({ index: 1 });
        const stage = screen.getByAltText("Second photo").parentElement;
        vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({ left: 100, width: 400 });

        fireEvent.click(screen.getByText("RSO Fair"), { clientX: 120 });

        expect(onIndexChange).toHaveBeenCalledWith(0);
    });
});

describe("PhotoLightbox loading ahead", () => {
    // Records every photo the viewer starts downloading in the background.
    let requested;
    beforeEach(() => {
        requested = [];
        vi.stubGlobal(
            "Image",
            class {
                set src(value) {
                    requested.push(value);
                }
                decode() {
                    return Promise.resolve();
                }
            },
        );
    });
    afterEach(() => vi.unstubAllGlobals());

    test("starts downloading the photos either side of the open one", () => {
        renderLightbox({ index: 1 });

        expect(requested.sort()).toEqual(["one.jpg", "three.jpg"]);
    });

    test("the photos either side wrap around at both ends of the set", () => {
        renderLightbox({ index: 2 });

        expect(requested.sort()).toEqual(["one.jpg", "two.jpg"]);
    });

    test("moves on to the new neighbours when the viewer moves", () => {
        const { rerender } = render(
            <PhotoLightbox photos={photos} index={0} title="RSO Fair" onIndexChange={vi.fn()} onClose={vi.fn()} />,
        );
        requested = [];

        rerender(<PhotoLightbox photos={photos} index={1} title="RSO Fair" onIndexChange={vi.fn()} onClose={vi.fn()} />);

        expect(requested.sort()).toEqual(["one.jpg", "three.jpg"]);
    });

    test("downloads nothing while closed", () => {
        renderLightbox({ index: null });

        expect(requested).toEqual([]);
    });
});
