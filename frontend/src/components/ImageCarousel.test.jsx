import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import ImageCarousel from "./ImageCarousel";

const IMAGES = [
    { src: "academic-one.jpg", alt: "First academic photo" },
    { src: "academic-two.jpg", alt: "Second academic photo" },
    { src: "academic-three.jpg", alt: "Third academic photo" },
];

const renderCarousel = () =>
    render(<ImageCarousel images={IMAGES} label="Academic event photos" />);

describe("ImageCarousel", () => {
    test("renders every slide and starts on the first one", () => {
        renderCarousel();
        expect(screen.getByAltText("First academic photo")).toBeInTheDocument();
        expect(screen.getByAltText("Second academic photo")).toBeInTheDocument();
        expect(screen.getByAltText("Third academic photo")).toBeInTheDocument();
        expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    test("next control advances one slide and updates the position indicator", async () => {
        renderCarousel();
        await userEvent.click(screen.getByRole("button", { name: "Next image" }));
        expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });

    test("previous control from the first slide wraps to the last slide", async () => {
        renderCarousel();
        await userEvent.click(screen.getByRole("button", { name: "Previous image" }));
        expect(screen.getByText("3 / 3")).toBeInTheDocument();
    });

    test("next control wraps around from the last slide back to the first", async () => {
        renderCarousel();
        const next = screen.getByRole("button", { name: "Next image" });
        await userEvent.click(next);
        await userEvent.click(next);
        await userEvent.click(next);
        expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    test("dot controls jump directly to a slide", async () => {
        renderCarousel();
        await userEvent.click(screen.getByRole("button", { name: "Show image 2 of 3" }));
        expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });

    test("arrow keys navigate when the viewport is focused", async () => {
        renderCarousel();
        const viewport = screen.getByLabelText(/use arrow keys/);
        viewport.focus();
        await userEvent.keyboard("{ArrowRight}");
        expect(screen.getByText("2 / 3")).toBeInTheDocument();
        await userEvent.keyboard("{ArrowLeft}");
        expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });

    test("announces the current position to assistive technology", async () => {
        renderCarousel();
        expect(screen.getByText("1 / 3")).toHaveAttribute("aria-live", "polite");
    });
});
