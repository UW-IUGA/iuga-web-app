import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ShopPage from "./Shop";
import { ShopCartProvider } from "../context/ShopCartContext";
import { shopProducts } from "../assets/data/ShopData";
import { publicCatalog, shopCatalog } from "../../../backend/routes/api/v1/utils/shopCatalog";
import infoHoodie from "../assets/shop/info-hoodie.png";
import infoCrewneck from "../assets/shop/info-crewneck.png";
import infoBaseballTee from "../assets/shop/info-baseball-tee.png";
import infoToteBag from "../assets/shop/info-tote-bag.png";

beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => ({
            status: "success",
            catalog: publicCatalog(shopCatalog, Date.parse("2026-10-01T00:00:00.000Z")),
        }),
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
});

test("loads the shop with canonical catalog products and their real images", async () => {
    const imagesBySku = {
        "info-hoodie": infoHoodie,
        "info-crewneck": infoCrewneck,
        "info-baseball-tee": infoBaseballTee,
        "info-tote-bag": infoToteBag,
    };

    expect(shopProducts.map(({ sku, name }) => ({ sku, name }))).toEqual(
        shopCatalog.items.map(({ sku, name }) => ({ sku, name })),
    );

    render(
        <MemoryRouter initialEntries={["/shop"]}>
            <ShopCartProvider><ShopPage /></ShopCartProvider>
        </MemoryRouter>,
    );

    for (const { sku, name } of shopCatalog.items) {
        expect(await screen.findByRole("heading", { name, exact: true })).toBeInTheDocument();
        for (const image of screen.getAllByRole("img", { name: `${name} product mockup` })) {
            expect(image).toHaveAttribute("src", imagesBySku[sku]);
        }
    }
});
