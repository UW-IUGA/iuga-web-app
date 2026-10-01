import { render, screen } from "@testing-library/react";
import ShopPage from "./Shop";
import { shopProducts } from "../assets/data/ShopData";
import { shopCatalog } from "../../../backend/routes/api/v1/utils/shopCatalog";
import infoHoodie from "../assets/shop/info-hoodie.png";
import infoCrewneck from "../assets/shop/info-crewneck.png";
import infoBaseballTee from "../assets/shop/info-baseball-tee.png";
import infoTshirt from "../assets/shop/info-t-shirt.png";
import infoToteBag from "../assets/shop/info-tote-bag.png";

test("loads the shop with canonical catalog products and their real images", () => {
    const imagesBySku = {
        "info-hoodie": infoHoodie,
        "info-crewneck": infoCrewneck,
        "info-baseball-tee": infoBaseballTee,
        "info-t-shirt": infoTshirt,
        "info-tote-bag": infoToteBag,
    };

    expect(shopProducts.map(({ sku, name }) => ({ sku, name }))).toEqual(
        shopCatalog.items.map(({ sku, name }) => ({ sku, name })),
    );

    render(<ShopPage />);

    for (const { sku, name } of shopCatalog.items) {
        expect(screen.getByRole("heading", { name, exact: true })).toBeInTheDocument();
        expect(screen.getByRole("img", { name: `${name} product mockup` })).toHaveAttribute(
            "src",
            imagesBySku[sku],
        );
    }
});
