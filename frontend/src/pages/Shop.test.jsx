import { render, screen, within } from "@testing-library/react";
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

test("shows each product's material on its card", async () => {
    render(
        <MemoryRouter initialEntries={["/shop"]}>
            <ShopCartProvider><ShopPage /></ShopCartProvider>
        </MemoryRouter>,
    );

    const materialOf = async (name) => {
        const card = (await screen.findByRole("heading", { name, exact: true })).closest("article");
        return within(card).getByText("Material").nextElementSibling.textContent;
    };

    expect(await materialOf("Hoodie")).toBe("50/50 cotton/polyester");
    expect(await materialOf("Crewneck")).toBe("60/40 cotton/polyester");
    expect(await materialOf("Baseball Tee")).toBe("90/10 cotton/polyester");
    expect(await materialOf("Tote Bag")).toBe("60/40 recycled cotton/polyester");
});

test("offers XS through 2XL on the apparel cards and no size choice on the tote bag", async () => {
    render(
        <MemoryRouter initialEntries={["/shop"]}>
            <ShopCartProvider><ShopPage /></ShopCartProvider>
        </MemoryRouter>,
    );

    const cardFor = async (name) => (await screen.findByRole("heading", { name, exact: true })).closest("article");
    const sizeGroupOf = (card) => within(card).queryByRole("group", { name: "Choose size" });

    for (const name of ["Hoodie", "Crewneck", "Baseball Tee"]) {
        const sizeGroup = sizeGroupOf(await cardFor(name));
        expect(within(sizeGroup).getAllByRole("button").map((button) => button.textContent)).toEqual(["XS", "S", "M", "L", "XL", "2XL"]);
    }
    expect(sizeGroupOf(await cardFor("Tote Bag"))).toBeNull();
});
