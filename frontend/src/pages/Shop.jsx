/*
 * Purpose: Public merchandise storefront and cart with dynamic catalog fetching,
 *          client-side cart reconciliation, just-in-time sign-in, and Stripe checkout handoff.
 * Authentication/Authorization Requirements: Browsing the catalog and building a cart are public.
 *          Checkout requires an authenticated session via useAuthContext().signIn() before dispatching to Stripe.
 * Expected Request Information: Fetches GET /api/v1/shop/catalog and POSTs /api/v1/shop/checkout.
 * Expected Response Information: Catalog JSON with items and pricing on fetch; Stripe URL on checkout.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { shopProducts } from "../assets/data/ShopData";
import { useAuthContext } from "../context/AuthContext";
import {
    addLine,
    removeLine,
    setQuantity,
    cartTotal,
    reconcileCart,
    parseCart,
} from "../utils/shopCart";

const CART_STORAGE_KEY = "iuga_shop_cart";

/**
 * @behavior Formats integer cents into a USD dollar string.
 * @param {number} cents
 * @returns {string}
 */
function formatCents(cents) {
    return `$${((cents || 0) / 100).toFixed(2)}`;
}

/**
 * @behavior Safely reads and validates cart from sessionStorage.
 * @returns {Array<{sku: string, size: string, quantity: number}>}
 */
function readStoredCart() {
    try {
        const raw = window.sessionStorage.getItem(CART_STORAGE_KEY);
        return parseCart(raw);
    } catch {
        return [];
    }
}

/**
 * @behavior Safely writes validated cart array to sessionStorage.
 * @param {Array<{sku: string, size: string, quantity: number}>} cart
 */
function writeStoredCart(cart) {
    try {
        window.sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
        // Storage restricted or unavailable
    }
}

function ShopPage() {
    const auth = useAuthContext();
    const isAuthenticated = auth?.isAuthenticated || false;
    const signIn = auth?.signIn;

    const [catalog, setCatalog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [cart, setCart] = useState(() => readStoredCart());
    const [selectedOptions, setSelectedOptions] = useState({});

    const [checkoutNotice, setCheckoutNotice] = useState(null);
    const [reconcileNotice, setReconcileNotice] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);

    const checkoutParam = useMemo(() => {
        try {
            return new URLSearchParams(window.location.search).get("checkout");
        } catch {
            return null;
        }
    }, []);

    const assetBySku = useMemo(() => {
        const map = new Map();
        for (const product of shopProducts) {
            if (product.sku) {
                map.set(product.sku, product);
            }
        }
        return map;
    }, []);

    const catalogItemBySku = useMemo(() => {
        const map = new Map();
        if (catalog && Array.isArray(catalog.items)) {
            for (const item of catalog.items) {
                map.set(item.sku, item);
            }
        }
        return map;
    }, [catalog]);

    const fetchCatalog = useCallback(async (isSilent = false) => {
        if (!isSilent) {
            setLoading(true);
        }
        setError(null);
        try {
            const response = await fetch("/api/v1/shop/catalog");
            if (!response.ok) {
                throw new Error(`Catalog fetch failed with status ${response.status}`);
            }
            const data = await response.json();
            if (data.status !== "success" || !data.catalog) {
                throw new Error("Invalid catalog format");
            }
            setCatalog(data.catalog);

            // Reconcile stored cart against latest catalog
            const stored = readStoredCart();
            const { cart: reconciled, removed } = reconcileCart(stored, data.catalog);
            setCart(reconciled);
            writeStoredCart(reconciled);

            if (removed.length > 0) {
                const itemDescriptions = removed.map((r) => `${r.sku} (${r.size})`).join(", ");
                setReconcileNotice(
                    `The following items are no longer available and were removed from your cart: ${itemDescriptions}`
                );
            }
        } catch {
            if (!isSilent) {
                setError("Unable to load catalog. Please check your connection and try again.");
            }
        } finally {
            if (!isSilent) {
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        fetchCatalog();
    }, [fetchCatalog]);

    const getItemSelection = (item) => {
        const defaultSize = item.sizes && item.sizes.length > 0 ? item.sizes[0] : "";
        const current = selectedOptions[item.sku];
        return {
            size: current?.size ?? defaultSize,
            quantity: current?.quantity ?? 1,
        };
    };

    const handleSizeChange = (sku, size) => {
        setSelectedOptions((prev) => ({
            ...prev,
            [sku]: { ...(prev[sku] || { quantity: 1 }), size },
        }));
    };

    const handleQuantityChange = (sku, quantity) => {
        setSelectedOptions((prev) => ({
            ...prev,
            [sku]: { ...(prev[sku] || {}), quantity },
        }));
    };

    const handleAddToCart = (item) => {
        const selection = getItemSelection(item);
        const qty = Math.max(1, Math.floor(Number(selection.quantity) || 1));
        const nextCart = addLine(cart, {
            sku: item.sku,
            size: selection.size,
            quantity: qty,
        });
        setCart(nextCart);
        writeStoredCart(nextCart);
    };

    const handleUpdateCartLineQuantity = (sku, size, newQty) => {
        const nextCart = setQuantity(cart, sku, size, newQty);
        setCart(nextCart);
        writeStoredCart(nextCart);
    };

    const handleRemoveCartLine = (sku, size) => {
        const nextCart = removeLine(cart, sku, size);
        setCart(nextCart);
        writeStoredCart(nextCart);
    };

    const handleCheckout = async () => {
        if (submittingRef.current || isSubmitting) return;
        if (!catalog || catalog.saleState !== "open" || cart.length === 0) return;

        setCheckoutNotice(null);

        if (!isAuthenticated) {
            if (typeof signIn === "function") {
                const user = await signIn();
                if (!user) {
                    return;
                }
            } else {
                return;
            }
        }

        submittingRef.current = true;
        setIsSubmitting(true);

        try {
            const response = await fetch("/api/v1/shop/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    catalogVersion: catalog.catalogVersion,
                    items: cart.map((line) => ({
                        sku: line.sku,
                        size: line.size,
                        quantity: line.quantity,
                    })),
                }),
            });

            if (response.status === 200) {
                const data = await response.json();
                if (data.url) {
                    if (typeof window.location.assign === "function") {
                        window.location.assign(data.url);
                    } else {
                        window.location.href = data.url;
                    }
                }
                return;
            }

            if (response.status === 409) {
                await fetchCatalog(true);
                setCheckoutNotice(
                    "The catalog has updated or the sale status changed. Please review your cart and confirm your order again."
                );
                return;
            }

            if (response.status === 401) {
                setCheckoutNotice("Please sign in again to check out.");
                return;
            }

            setCheckoutNotice("Unable to start checkout. Please try again later.");
        } catch {
            setCheckoutNotice("Unable to start checkout. Please try again later.");
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    };

    const totalItemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

    return (
        <div className="baseContainer">
            <main className="shopPage">
                <section className="shopPage__hero" aria-labelledby="shop-title">
                    <p className="shopPage__kicker">IUGA collection</p>
                    <h1 id="shop-title">Informatics Merch</h1>
                    <p>
                        Official Informatics apparel and accessories. Pre-order now; orders will be distributed
                        via on-campus pickup.
                    </p>
                </section>

                {checkoutParam === "complete" && (
                    <div className="shopPage__banner shopPage__banner--complete" role="status">
                        <p>
                            Returning from checkout is not by itself an order confirmation. Please check your email for the
                            receipt Stripe sent you to confirm payment. Your cart is still here if you need to review it, and
                            please contact the IUGA officers if something looks wrong.
                        </p>
                    </div>
                )}

                {checkoutParam === "canceled" && (
                    <div className="shopPage__banner shopPage__banner--canceled" role="status">
                        <p>
                            Your checkout was canceled. Your items are still in your cart if you would like
                            to continue later.
                        </p>
                    </div>
                )}

                {reconcileNotice && (
                    <div className="shopPage__banner shopPage__banner--warning" role="status">
                        <p>{reconcileNotice}</p>
                    </div>
                )}

                {loading && !catalog && (
                    <div className="shopPage__loading" role="status">
                        <p>Loading merchandise catalog...</p>
                    </div>
                )}

                {error && !catalog && (
                    <div className="shopPage__error" role="status">
                        <p>{error}</p>
                        <button
                            type="button"
                            className="pill-button"
                            onClick={() => fetchCatalog()}
                        >
                            Try again
                        </button>
                    </div>
                )}

                {catalog && (
                    <>
                        <section className="shopPage__collection" aria-labelledby="collection-title">
                            <div className="shopPage__collectionHeader">
                                <div>
                                    <p className="shopPage__kicker">The collection</p>
                                    <h2 id="collection-title">Pre-order drop</h2>
                                </div>
                                <p>
                                    {catalog.items.length} {catalog.items.length === 1 ? "item" : "items"}
                                </p>
                            </div>

                            <div className="shopPage__grid">
                                {catalog.items.map((item) => {
                                    const asset = assetBySku.get(item.sku);
                                    const selection = getItemSelection(item);
                                    const priceFormatted = formatCents(item.unitAmount);

                                    return (
                                        <article className="shopCard" key={item.sku}>
                                            {asset?.image && (
                                                <div className="shopCard__imageWrap">
                                                    <img
                                                        src={asset.image}
                                                        alt={`${item.name} product mockup`}
                                                    />
                                                </div>
                                            )}
                                            <div className="shopCard__details">
                                                <div className="shopCard__info">
                                                    <h3>{item.name}</h3>
                                                    {asset?.description && <p>{asset.description}</p>}
                                                    <p className="shopCard__price">{priceFormatted}</p>
                                                </div>

                                                <div className="shopCard__controls">
                                                    {item.sizes.length > 1 ? (
                                                        <div className="shopCard__controlGroup">
                                                            <label
                                                                htmlFor={`size-${item.sku}`}
                                                                className="shopCard__label"
                                                            >
                                                                Size for {item.name}
                                                            </label>
                                                            <select
                                                                id={`size-${item.sku}`}
                                                                className="shopCard__select"
                                                                value={selection.size}
                                                                onChange={(e) =>
                                                                    handleSizeChange(item.sku, e.target.value)
                                                                }
                                                            >
                                                                {item.sizes.map((s) => (
                                                                    <option key={s} value={s}>
                                                                        {s}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    ) : (
                                                        <div className="shopCard__controlGroup">
                                                            <span className="shopCard__staticLabel">
                                                                Size: {item.sizes[0]}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="shopCard__controlGroup">
                                                        <label
                                                            htmlFor={`qty-${item.sku}`}
                                                            className="shopCard__label"
                                                        >
                                                            Quantity for {item.name}
                                                        </label>
                                                        <input
                                                            id={`qty-${item.sku}`}
                                                            type="number"
                                                            min="1"
                                                            className="shopCard__input"
                                                            value={selection.quantity}
                                                            onChange={(e) => {
                                                                const val = parseInt(e.target.value, 10);
                                                                handleQuantityChange(
                                                                    item.sku,
                                                                    isNaN(val) ? "" : Math.max(1, val)
                                                                );
                                                            }}
                                                        />
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="pill-button shopCard__addButton"
                                                        onClick={() => handleAddToCart(item)}
                                                        aria-label={`Add ${item.name} to cart`}
                                                    >
                                                        Add to cart
                                                    </button>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="shopPage__cart shopCart" aria-labelledby="cart-heading">
                            <div className="shopCart__header">
                                <h2 id="cart-heading">Your Cart</h2>
                                <span className="shopCart__count">
                                    {totalItemCount} {totalItemCount === 1 ? "item" : "items"}
                                </span>
                            </div>

                            {cart.length === 0 ? (
                                <p className="shopCart__empty">Your cart is empty.</p>
                            ) : (
                                <ul className="shopCart__list">
                                    {cart.map((line) => {
                                        const itemDef = catalogItemBySku.get(line.sku);
                                        const name = itemDef?.name || line.sku;
                                        const unitAmount = itemDef?.unitAmount || 0;
                                        const lineTotal = unitAmount * line.quantity;

                                        return (
                                            <li
                                                key={`${line.sku}-${line.size}`}
                                                className="shopCart__item"
                                            >
                                                <div className="shopCart__itemInfo">
                                                    <h3 className="shopCart__itemName">{name}</h3>
                                                    <span className="shopCart__itemSize">
                                                        Size: {line.size}
                                                    </span>
                                                    <span className="shopCart__linePrice">
                                                        {formatCents(lineTotal)}
                                                    </span>
                                                </div>

                                                <div className="shopCart__itemControls">
                                                    <label
                                                        htmlFor={`cart-qty-${line.sku}-${line.size}`}
                                                        className="shopCart__qtyLabel"
                                                    >
                                                        Quantity for {name} ({line.size})
                                                    </label>
                                                    <input
                                                        id={`cart-qty-${line.sku}-${line.size}`}
                                                        type="number"
                                                        min="1"
                                                        className="shopCart__qtyInput"
                                                        value={line.quantity}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value, 10);
                                                            handleUpdateCartLineQuantity(
                                                                line.sku,
                                                                line.size,
                                                                isNaN(val) ? 0 : val
                                                            );
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="shopCart__removeButton"
                                                        onClick={() =>
                                                            handleRemoveCartLine(line.sku, line.size)
                                                        }
                                                        aria-label={`Remove ${name} (${line.size}) from cart`}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}

                            <div className="shopCart__footer">
                                <p className="shopCart__subtotal">
                                    Subtotal: {formatCents(cartTotal(cart, catalog))}
                                </p>

                                {catalog.saleState === "closed" && (
                                    <p className="shopCart__saleStatusNotice" role="status">
                                        The merchandise sale is currently closed.
                                    </p>
                                )}

                                {catalog.saleState === "scheduled" && (
                                    <p className="shopCart__saleStatusNotice" role="status">
                                        The merchandise sale is scheduled and has not opened yet.
                                    </p>
                                )}

                                {checkoutNotice && (
                                    <p className="shopCart__checkoutNotice" role="status">
                                        {checkoutNotice}
                                    </p>
                                )}

                                <button
                                    type="button"
                                    className="pill-button shopCart__checkoutButton"
                                    disabled={
                                        cart.length === 0 ||
                                        isSubmitting ||
                                        catalog.saleState !== "open"
                                    }
                                    onClick={handleCheckout}
                                >
                                    {isSubmitting
                                        ? "Processing checkout..."
                                        : !isAuthenticated
                                          ? "Sign in to checkout"
                                          : "Checkout"}
                                </button>
                            </div>
                        </section>
                    </>
                )}
            </main>
        </div>
    );
}

export default ShopPage;
