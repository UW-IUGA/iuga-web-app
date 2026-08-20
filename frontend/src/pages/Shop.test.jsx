import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import ShopPage from "./Shop";

describe("ShopPage", () => {
    test("displays each product in the collection", () => {
        render(<ShopPage />);

        expect(screen.getByRole("heading", { name: "Wear your Info pride." })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "INFO Hoodie" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "INFO Pullover" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "INFO Baseball Tee" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "INFO Simple Tee" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "INFO Tote Bag" })).toBeInTheDocument();
        expect(screen.getAllByText("Coming soon")).toHaveLength(6);
    });
});
