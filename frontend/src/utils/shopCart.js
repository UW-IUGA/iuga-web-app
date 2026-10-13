/*
 * Purpose: Pure merchandise cart calculations, cart entry manipulation, validation, and catalog reconciliation.
 * Authentication/Authorization Requirements: None (pure utility functions, no browser or network access).
 * Expected Request Information: Carts represented as arrays of { sku, size, quantity }, cart entries, and catalog data.
 * Expected Response Information: New immutable cart arrays, removed-entry summaries, or integer currency totals.
 */

/**
 * @behavior The most units of one sku+size line a shopper may hold. Client-only
 *           display policy; the server enforces its own line-count and amount caps.
 */
export const MAX_QUANTITY = 100;

/**
 * @behavior Adds a cart entry, or sums the quantity when a matching sku and size already exists.
 *           Adding the same product and size again therefore keeps one entry and raises its quantity,
 *           rather than creating a second duplicate entry.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 * @param {{sku: string, size: string, quantity: number}} entry
 * @returns {Array<{sku: string, size: string, quantity: number}>}
 */
export function addToCart(cart, entry) {
    if (!entry || typeof entry.sku !== "string" || typeof entry.size !== "string") {
        return Array.isArray(cart) ? [...cart] : [];
    }
    const currentCart = Array.isArray(cart) ? cart : [];
    const quantityToAdd = Math.max(1, Math.floor(Number(entry.quantity) || 1));
    const existingIndex = currentCart.findIndex(
        (item) => item.sku === entry.sku && item.size === entry.size
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
            sku: entry.sku,
            size: entry.size,
            quantity: quantityToAdd,
        },
    ];
}

/**
 * @behavior Removes any cart entry matching the specified sku and size.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 * @param {string} sku
 * @param {string} size
 * @returns {Array<{sku: string, size: string, quantity: number}>}
 */
export function removeFromCart(cart, sku, size) {
    if (!Array.isArray(cart)) return [];
    return cart
        .filter((item) => !(item.sku === sku && item.size === size))
        .map((item) => ({ ...item }));
}

/**
 * @behavior Sets a cart entry's quantity, removing the entry completely when quantity is below 1.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 * @param {string} sku
 * @param {string} size
 * @param {number} quantity
 * @returns {Array<{sku: string, size: string, quantity: number}>}
 */
export function setCartQuantity(cart, sku, size, quantity) {
    const qty = Math.floor(Number(quantity));
    if (isNaN(qty) || qty < 1) {
        return removeFromCart(cart, sku, size);
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
 * @behavior Computes cart total in integer cents using catalog unitPriceCents. Unknown SKUs contribute 0.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 * @param {Object} catalog
 * @returns {number} Integer cents total
 */
export function cartTotal(cart, catalog) {
    if (!Array.isArray(cart) || !catalog || !Array.isArray(catalog.items)) {
        return 0;
    }
    const priceCentsBySku = new Map(
        catalog.items.map((item) => [item.sku, item.unitPriceCents || 0])
    );

    let total = 0;
    for (const entry of cart) {
        const priceCents = priceCentsBySku.get(entry.sku) || 0;
        const quantity = Math.max(0, Math.floor(Number(entry.quantity) || 0));
        total += priceCents * quantity;
    }
    return total;
}

/**
 * @behavior Drops cart entries whose SKU or size no longer exists in the catalog.
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
            removed: cart.map((entry) => ({ sku: entry.sku, size: entry.size })),
        };
    }

    const itemMap = new Map(catalog.items.map((item) => [item.sku, item]));
    const reconciledCart = [];
    const removed = [];

    for (const entry of cart) {
        const catalogItem = itemMap.get(entry.sku);
        if (!catalogItem || !Array.isArray(catalogItem.sizes) || !catalogItem.sizes.includes(entry.size)) {
            removed.push({ sku: entry.sku, size: entry.size });
        } else {
            reconciledCart.push({ ...entry });
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

    const validEntries = [];
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
                validEntries.push({
                    sku: item.sku.trim(),
                    size: item.size.trim(),
                    quantity: qty,
                });
            }
        }
    }
    return validEntries;
}
