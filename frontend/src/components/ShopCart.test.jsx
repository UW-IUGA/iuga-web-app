import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ShopCartDropdown } from "./ShopCart";

const catalog = {
    saleState: "open",
    items: [{ sku: "test-shirt", name: "Campus shirt", sizes: ["M"], unitPriceCents: 2500 }],
};

test.each([true, false].flatMap((isAuthenticated) =>
    ["open", "scheduled", "closed", "loading", "unavailable"].map((state) => ({ isAuthenticated, state }))
))("checkout stays coming soon with authentication=$isAuthenticated and catalog=$state", ({ isAuthenticated, state }) => {
    const onCheckout = vi.fn();
    render(
        <MemoryRouter>
            <ShopCartDropdown
                cart={[{ sku: "test-shirt", size: "M", quantity: 2 }]}
                totalQuantity={2}
                catalog={["loading", "unavailable"].includes(state) ? null : { ...catalog, saleState: state }}
                catalogLoading={state === "loading"}
                isAuthenticated={isAuthenticated}
                onCheckout={onCheckout}
            />
        </MemoryRouter>
    );

    const button = screen.getByRole("button", { name: "Checkout coming soon" });
    expect(button).toBeDisabled();
    userEvent.click(button);
    fireEvent.click(button);
    expect(onCheckout).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Sign in to checkout" })).not.toBeInTheDocument();
});
