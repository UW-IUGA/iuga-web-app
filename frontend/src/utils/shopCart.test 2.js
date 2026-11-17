import { capLineQuantity, findOverLimitProduct, isSkuAtLimit, limitForSku, unitsForSku } from "./shopCart";

describe("findOverLimitProduct", () => {
    const items = [{ sku: "info-crewneck", name: "Crewneck", perStudentLimit: 5 }];

    it("allows units up to a configured limit, counted across sizes", () => {
        const cart = [
            { sku: "info-crewneck", size: "M", quantity: 2 },
            { sku: "info-crewneck", size: "L", quantity: 3 },
        ];

        expect(findOverLimitProduct(cart, items)).toBeNull();
    });

    it("reports the product once its units across sizes pass the limit", () => {
        const cart = [
            { sku: "info-crewneck", size: "M", quantity: 2 },
            { sku: "info-crewneck", size: "L", quantity: 4 },
        ];

        expect(findOverLimitProduct(cart, items)).toEqual({ name: "Crewneck", perStudentLimit: 5 });
    });

    it("does not check an item without a numeric limit", () => {
        const cart = [{ sku: "info-crewneck", size: "M", quantity: 9 }];

        expect(findOverLimitProduct(cart, [{ sku: "info-crewneck", name: "Crewneck" }])).toBeNull();
    });
});

describe("per-student limit helpers", () => {
    const catalog = {
        items: [
            { sku: "info-hoodie", name: "Hoodie", perStudentLimit: 1 },
            { sku: "info-crewneck", name: "Crewneck" },
        ],
    };

    it("reads a product's limit from the catalog, or null when none is given", () => {
        expect(limitForSku(catalog, "info-hoodie")).toBe(1);
        expect(limitForSku(catalog, "info-crewneck")).toBeNull();
        expect(limitForSku(null, "info-hoodie")).toBeNull();
    });

    it("counts a product's units across sizes and ignores other products", () => {
        const cart = [
            { sku: "info-hoodie", size: "M", quantity: 1 },
            { sku: "info-crewneck", size: "M", quantity: 4 },
        ];

        expect(unitsForSku(cart, "info-hoodie")).toBe(1);
    });

    it("reports a product at its limit, and never at a missing limit", () => {
        const cart = [{ sku: "info-hoodie", size: "M", quantity: 1 }];

        expect(isSkuAtLimit(cart, "info-hoodie", 1)).toBe(true);
        expect(isSkuAtLimit(cart, "info-hoodie", 2)).toBe(false);
        expect(isSkuAtLimit(cart, "info-hoodie", null)).toBe(false);
    });

    it("caps a line so the product's units across sizes stay within the limit", () => {
        const cart = [{ sku: "info-crewneck", size: "M", quantity: 2 }];

        expect(capLineQuantity(cart, "info-crewneck", "L", 4, 5)).toBe(3);
        expect(capLineQuantity(cart, "info-crewneck", "M", 9, 5)).toBe(5);
    });

    it("gives a size no units when other sizes already fill the limit", () => {
        const cart = [{ sku: "info-hoodie", size: "M", quantity: 1 }];

        expect(capLineQuantity(cart, "info-hoodie", "L", 1, 1)).toBe(0);
    });

    it("lets a line keep its units when the limit was lowered below the bag", () => {
        const cart = [
            { sku: "info-crewneck", size: "M", quantity: 3 },
            { sku: "info-crewneck", size: "L", quantity: 2 },
        ];

        expect(capLineQuantity(cart, "info-crewneck", "M", 4, 2)).toBe(3);
        expect(capLineQuantity(cart, "info-crewneck", "M", 1, 2)).toBe(1);
        expect(capLineQuantity(cart, "info-crewneck", "L", 9, 2)).toBe(2);
    });
});
