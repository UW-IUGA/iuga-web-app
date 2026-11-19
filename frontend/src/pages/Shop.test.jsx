import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

// The mockups are drawn on white, so a dark frame around one leaves a white box with the
// item name lost over it. base/theme gives a data-theme="light" region the light colours.
const themeOf = (element) => element.closest("[data-theme]").dataset.theme;

function renderShopInDarkTheme() {
    document.documentElement.dataset.theme = "dark";
    render(
        <MemoryRouter initialEntries={["/shop"]}>
            <ShopCartProvider><ShopPage /></ShopCartProvider>
        </MemoryRouter>,
    );
}

describe("in the dark theme", () => {
    afterEach(() => {
        delete document.documentElement.dataset.theme;
    });

    test("shows the hero carousel's product photo and name on a white frame in the light palette", async () => {
        renderShopInDarkTheme();

        const hero = screen.getByRole("region", { name: "The Informatics Fall Collection." });
        const photo = within(hero).getByRole("img", { name: `${shopProducts[0].name} product mockup` });
        expect(themeOf(photo)).toBe("light");
        expect(themeOf(within(hero).getByText(shopProducts[0].name))).toBe("light");
        // Let the catalog finish loading before the page is torn down.
        await screen.findByRole("heading", { name: shopProducts[0].name, exact: true });
    });
});

describe("when the catalog cannot load", () => {
    test("shows every product as a read-only preview with its price unavailable and ordering disabled", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

        render(
            <MemoryRouter initialEntries={["/shop"]}>
                <ShopCartProvider><ShopPage /></ShopCartProvider>
            </MemoryRouter>,
        );

        for (const { name } of shopProducts) {
            expect(await screen.findByRole("heading", { name, exact: true })).toBeVisible();
        }
        expect(screen.getAllByText("Price unavailable")).toHaveLength(shopProducts.length);
        const addToCartButtons = screen.getAllByRole("button", { name: "Add to cart" });
        expect(addToCartButtons).toHaveLength(shopProducts.length);
        for (const button of addToCartButtons) {
            expect(button).toBeDisabled();
        }
    });

    test("Reload on the preview reloads the catalog and replaces the preview with live prices", async () => {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });

        render(
            <MemoryRouter initialEntries={["/shop"]}>
                <ShopCartProvider><ShopPage /></ShopCartProvider>
            </MemoryRouter>,
        );

        expect(await screen.findByText(/ordering is unavailable right now/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Reload" }));

        await waitFor(() => expect(screen.getAllByRole("button", { name: "Add to cart" })).toHaveLength(shopProducts.length));
        expect(screen.queryByText("Price unavailable")).not.toBeInTheDocument();
        expect(screen.queryByText(/ordering is unavailable right now/i)).not.toBeInTheDocument();
        for (const button of screen.getAllByRole("button", { name: "Add to cart" })) {
            expect(button).toBeEnabled();
        }
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });
});
