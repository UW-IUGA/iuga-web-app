/*
 * Purpose: Pure merchandise cart calculations, line manipulation, validation, and catalog reconciliation.
 * Authentication/Authorization Requirements: None (pure utility functions, no browser or network access).
 * Expected Request Information: Carts represented as arrays of { sku, size, quantity }, line objects, and catalog data.
 * Expected Response Information: New immutable cart arrays, line removal summaries, or integer currency totals.
 */

/**
 * @behavior Adds a line item to the cart or sums quantity if sku and size match an existing line.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 * @param {{sku: string, size: string, quantity: number}} line
 * @returns {Array<{sku: string, size: string, quantity: number}>}
 */
export function addLine(cart, line) {
    if (!line || typeof line.sku !== "string" || typeof line.size !== "string") {
        return Array.isArray(cart) ? [...cart] : [];
    }
    const currentCart = Array.isArray(cart) ? cart : [];
    const quantityToAdd = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const existingIndex = currentCart.findIndex(
        (item) => item.sku === line.sku && item.size === line.size
    );

    if (existingIndex >= 0) {
        return currentCart.map((item, index) => {
            if (index === existingIndex) {
                return {
                    sku: item.sku,
                    size: item.size,
                    quantity: item.quantity + quantityToAdd,
                };
            }
            return { ...item };
        });
    }

    return [
        ...currentCart.map((item) => ({ ...item })),
        {
            sku: line.sku,
            size: line.size,
            quantity: quantityToAdd,
        },
    ];
}

/**
 * @behavior Removes any line matching the specified sku and size.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 * @param {string} sku
 * @param {string} size
 * @returns {Array<{sku: string, size: string, quantity: number}>}
 */
export function removeLine(cart, sku, size) {
    if (!Array.isArray(cart)) return [];
    return cart
        .filter((item) => !(item.sku === sku && item.size === size))
        .map((item) => ({ ...item }));
}

/**
 * @behavior Sets line quantity, dropping the line completely if quantity is below 1.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 * @param {string} sku
 * @param {string} size
 * @param {number} quantity
 * @returns {Array<{sku: string, size: string, quantity: number}>}
 */
export function setQuantity(cart, sku, size, quantity) {
    const qty = Math.floor(Number(quantity));
    if (isNaN(qty) || qty < 1) {
        return removeLine(cart, sku, size);
    }
    if (!Array.isArray(cart)) return [];
    return cart.map((item) => {
        if (item.sku === sku && item.size === size) {
            return { ...item, quantity: qty };
        }
        return { ...item };
    });
}

/**
 * @behavior Computes cart total in integer cents using catalog unitAmount. Unknown SKUs contribute 0.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 * @param {Object} catalog
 * @returns {number} Integer cents total
 */
export function cartTotal(cart, catalog) {
    if (!Array.isArray(cart) || !catalog || !Array.isArray(catalog.items)) {
        return 0;
    }
    const priceBySku = new Map(
        catalog.items.map((item) => [item.sku, item.unitAmount || 0])
    );

    let total = 0;
    for (const line of cart) {
        const unitAmount = priceBySku.get(line.sku) || 0;
        const quantity = Math.max(0, Math.floor(Number(line.quantity) || 0));
        total += unitAmount * quantity;
    }
    return total;
}

/**
 * @behavior Drops cart lines whose SKU or size no longer exists in the catalog.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 * @param {Object} catalog
 * @returns {{ cart: Array<{sku: string, size: string, quantity: number}>, removed: Array<{sku: string, size: string}> }}
 */
export function reconcileCart(cart, catalog) {
    if (!Array.isArray(cart)) {
        return { cart: [], removed: [] };
    }
    if (!catalog || !Array.isArray(catalog.items)) {
        return {
            cart: [],
            removed: cart.map((item) => ({ sku: item.sku, size: item.size })),
        };
    }

    const itemMap = new Map(catalog.items.map((item) => [item.sku, item]));
    const reconciledCart = [];
    const removed = [];

    for (const line of cart) {
        const catalogItem = itemMap.get(line.sku);
        if (!catalogItem || !Array.isArray(catalogItem.sizes) || !catalogItem.sizes.includes(line.size)) {
            removed.push({ sku: line.sku, size: line.size });
        } else {
            reconciledCart.push({ ...line });
        }
    }

    return { cart: reconciledCart, removed };
}

/**
 * @behavior Parses raw stored data into a validated cart array. Returns empty array on malformed input.
 * @param {unknown} raw
 * @returns {Array<{sku: string, size: string, quantity: number}>}
 */
export function parseCart(raw) {
    if (!raw) return [];
    let parsed = raw;
    if (typeof raw === "string") {
        try {
            parsed = JSON.parse(raw);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(parsed)) return [];

    const validLines = [];
    for (const item of parsed) {
        if (
            item &&
            typeof item === "object" &&
            typeof item.sku === "string" &&
            item.sku.trim() !== "" &&
            typeof item.size === "string" &&
            item.size.trim() !== ""
        ) {
            const qty = Math.floor(Number(item.quantity));
            if (!isNaN(qty) && qty >= 1) {
                validLines.push({
                    sku: item.sku.trim(),
                    size: item.size.trim(),
                    quantity: qty,
                });
            }
        }
    }
    return validLines;
}
