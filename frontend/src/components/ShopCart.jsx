/*
 * Purpose: Presentational shop cart chrome (trigger, cart dropdown, quantity input)
 *          rendered globally by ShopCartProvider. No cart state lives here;
 *          everything arrives via props.
 * Authentication/Authorization Requirements: None (presentational only).
 * Expected Request Information: Cart lines, catalog, counts, and callbacks from the provider.
 * Expected Response Information: Navbar trigger and cart dropdown markup.
 */
import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCartShopping, faTrashCan } from "@fortawesome/free-solid-svg-icons";
import { shopProducts } from "../assets/data/ShopData";
import { cartTotal, MAX_QUANTITY } from "../utils/shopCart";
import { formatCents, formatDate } from "../utils/shopFormat";

/**
 * @behavior Editable quantity control: step with −/+ buttons, or type 1–100 directly.
 * Typing commits on blur/Enter; clearing the field commits 0 (removes the line);
 * out-of-range values snap back without touching the cart.
 * @param {string} label
 * @param {string} quantityLabel
 * @param {number} quantity
 * @param {Function} onIncrease
 * @param {Function} onDecrease
 * @param {Function} onQuantityChange
 * @param {boolean} removeAtOne
 */
export function QuantityInput({ label, quantityLabel = `${label} quantity`, quantity, onIncrease, onDecrease, onQuantityChange, removeAtOne = false }) {
    const [draft, setDraft] = useState(null);

    useEffect(() => {
        setDraft(null);
    }, [quantity]);

    const commitDraft = () => {
        const value = draft;
        setDraft(null);
        if (value === null) return;
        if (value === "") {
            onQuantityChange(0);
            return;
        }
        const parsed = Number.parseInt(value, 10);
        if (parsed >= 1 && parsed <= MAX_QUANTITY && parsed !== quantity) {
            onQuantityChange(parsed);
        }
    };

    return (
        <div className="shopQuantity" aria-label={quantityLabel}>
            <button type="button" aria-label={removeAtOne && quantity === 1 ? `Remove ${label} from cart` : `Decrease ${label}`} onClick={onDecrease}>
                {removeAtOne && quantity === 1 ? <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /> : "−"}
            </button>
            <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                aria-label={`${quantityLabel}. Type a number from 1 to ${MAX_QUANTITY}.`}
                value={draft ?? String(quantity)}
                onChange={(event) => setDraft(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                onBlur={commitDraft}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        commitDraft();
                        event.currentTarget.blur();
                    }
                }}
            />
            <button type="button" aria-label={`Increase ${label}`} onClick={onIncrease}>+</button>
        </div>
    );
}

/**
 * @behavior Navbar cart button. Always rendered; the count badge appears only when items exist.
 * @param {number} totalQuantity
 * @param {boolean} isCartOpen
 * @param {Function} onToggle
 */
export function CartTrigger({ totalQuantity, isCartOpen, onToggle }) {
    return (
        <button
            type="button"
            aria-expanded={isCartOpen}
            aria-controls="shop-cart-dropdown"
            aria-label={totalQuantity === 0 ? "Shopping cart, empty" : `Cart, ${totalQuantity} ${totalQuantity === 1 ? "item" : "items"}`}
            onClick={onToggle}
            className="shopCartTrigger"
        >
            <FontAwesomeIcon className="shopCartTrigger__icon" icon={faCartShopping} aria-hidden="true" />
            {totalQuantity > 0 && (
                <span className="shopCartTrigger__count" aria-live="polite">
                    {totalQuantity}
                </span>
            )}
        </button>
    );
}

/**
 * @behavior Navbar-anchored cart dropdown: the cart's overlay UI. The trigger
 * opens it persistently; a fresh add opens it transiently (it fades away on
 * its own unless hovered or focused). The just-added line sorts first with
 * top and bottom borders that stay pinned across closes. The header always shows the
 * plain cart summary; a fresh add is confirmed to screen readers through a
 * visually hidden live region instead. An empty cart shows a shop CTA with
 * no $0 subtotal. Checkout reuses the cart checkout handler.
 * @param {object|null} lastAdded
 * @param {boolean} freshAdd
 * @param {Array} cart
 * @param {object|null} catalog
 * @param {boolean} catalogLoading
 * @param {string|null} catalogError
 * @param {number} totalQuantity
 * @param {string|null} checkoutParam
 * @param {string|null} checkoutNotice
 * @param {boolean} isSubmitting
 * @param {boolean} isAuthenticated
 * @param {Function} onCheckout
 * @param {Function} onQuantityChange
 * @param {Function} onRemove
 * @param {Function} onClose
 */
export function ShopCartDropdown({
    lastAdded,
    freshAdd,
    cart,
    catalog,
    catalogLoading,
    catalogError,
    totalQuantity,
    checkoutParam,
    checkoutNotice,
    isSubmitting,
    isAuthenticated,
    onCheckout,
    onQuantityChange,
    onRemove,
    onClose,
}) {

    const [leaving, setLeaving] = useState(false);
    const [paused, setPaused] = useState(false);
    useEffect(() => {
        setLeaving(false);
        if (!freshAdd || paused) return undefined;
        const hideTimer = window.setTimeout(() => setLeaving(true), 3600);
        const removeTimer = window.setTimeout(() => onClose?.(), 3850);
        return () => {
            window.clearTimeout(hideTimer);
            window.clearTimeout(removeTimer);
        };
    }, [freshAdd, lastAdded, onClose, paused]);

    useEffect(() => {
        const closeOnEscape = (event) => {
            if (event.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose]);

    const catalogItems = catalog && Array.isArray(catalog.items) ? catalog.items : [];
    const productBySku = new Map(shopProducts.map((product) => [product.sku, product]));
    const catalogItemBySku = new Map(catalogItems.map((item) => [item.sku, item]));
    const isEmpty = cart.length === 0;
  // The just-added line floats to the top so it is the first thing seen;
  // everything else keeps its order. Similar to a stack visually.
    const isJustAdded = (line) => !!lastAdded && line.sku === lastAdded.sku && line.size === lastAdded.size;
    const orderedCart = [...cart].sort(
        (a, b) => Number(isJustAdded(b)) - Number(isJustAdded(a))
    );
    const addedLine = lastAdded ? cart.find((line) => isJustAdded(line)) : null;
    const addedName = addedLine
        ? (catalogItemBySku.get(addedLine.sku)?.name || productBySku.get(addedLine.sku)?.name || addedLine.sku)
        : null;
    const checkoutDisabled =
        !catalog || cart.length === 0 || isSubmitting ||
        catalog.saleState !== "open" || checkoutParam === "complete";

    return (
        <div
            className={`shopCartDropdown${leaving ? " shopCartDropdown--leaving" : ""}`}
            data-testid="shop-cart-dropdown"
        >
            <button type="button" className="shopCartDropdown__backdrop" aria-label="Dismiss bag preview" onClick={onClose} />
            <div
                id="shop-cart-dropdown"
                className="shopCartDropdown__panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="shop-cart-dropdown-heading"
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
                onFocus={() => setPaused(true)}
                onBlur={() => setPaused(false)}
            >
                <div className="shopCartDropdown__header">
                    <p className="shopCartDropdown__status shopCartDropdown__status--plain">
                        <span id="shop-cart-dropdown-heading">
                            {isEmpty ? "Your bag" : `Your bag (${totalQuantity})`}
                        </span>
                    </p>
                    <button type="button" className="shopCartDropdown__close" aria-label="Close bag" onClick={onClose}>
                        <span aria-hidden="true">×</span>
                    </button>
                    {freshAdd && addedName && (
                        <p className="sr-only" role="status">Added {addedName} to bag.</p>
                    )}
                </div>
                {isEmpty ? (
                    <div className="shopCartDropdown__empty">
                        <h2 className="shopCartDropdown__emptyTitle">Your bag is empty.</h2>
                        <NavLink
                            to="/shop"
                            className="shopCard__addToCart shopCartDropdown__checkout"
                            data-testid="shop-cart-cta"
                            onClick={onClose}
                        >
                            Continue shopping
                        </NavLink>
                    </div>
                ) : (
                    <>
                        <ul className="shopCartDropdown__lines">
                            {orderedCart.map((line) => {
                                const catalogItem = catalogItemBySku.get(line.sku);
                                const product = productBySku.get(line.sku);
                                const name = catalogItem?.name || product?.name || line.sku;
                                const lineTotal = catalogItem ? catalogItem.unitPriceCents * line.quantity : null;
                                return (
                                    <li key={`${line.sku}-${line.size}`} className={`shopCartDropdown__line${isJustAdded(line) ? " shopCartDropdown__line--justAdded" : ""}`}>
                                        {product?.image && (
                                            <img className="shopCartDropdown__lineImage" src={product.image} alt="" loading="lazy" decoding="async" />
                                        )}
                                        <div className="shopCartDropdown__lineInfo">
                                            <p className="shopCartDropdown__lineName">{name}</p>
                                            {line.size !== "One Size" && (
                                                <p className="shopCartDropdown__lineMeta">Size {line.size}</p>
                                            )}
                                        </div>
                                        <QuantityInput
                                            label={`${name} ${line.size}`}
                                            quantityLabel={`${name} size ${line.size} quantity`}
                                            quantity={line.quantity}
                                            onDecrease={() => onQuantityChange?.(line.sku, line.size, line.quantity - 1)}
                                            onIncrease={() => onQuantityChange?.(line.sku, line.size, line.quantity + 1)}
                                            onQuantityChange={(value) => onQuantityChange?.(line.sku, line.size, value)}
                                            removeAtOne
                                        />
                                        <div className="shopCartDropdown__lineRail">
                                            {lineTotal !== null && (
                                                <p className="shopCartDropdown__linePrice">{formatCents(lineTotal)}</p>
                                            )}
                                            <button
                                                type="button"
                                                className="shopCartDropdown__removeText"
                                                aria-label={`Remove ${name} from bag`}
                                                onClick={() => onRemove?.(line.sku, line.size)}
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                        {catalog && (
                            <p className="shopCartDropdown__subtotal">
                                Subtotal: {formatCents(cartTotal(cart, catalog))}
                            </p>
                        )}
                        {!catalog && (
                            <p className="shopCartDropdown__notice" role="status">
                                {catalogError ?? (catalogLoading ? "Loading catalog..." : "Catalog unavailable. Prices and checkout are unavailable until the catalog loads.")}
                            </p>
                        )}
                        {catalog?.saleState === "scheduled" && (
                            <p className="shopCartDropdown__notice" role="status">
                                Fall merch goes on sale {formatDate(catalog.opensAt)}.
                            </p>
                        )}
                        {catalog?.saleState === "closed" && (
                            <p className="shopCartDropdown__notice" role="status">
                                Ordering for this drop ended {formatDate(catalog.closesAt)}.
                            </p>
                        )}
                        {checkoutNotice && <p className="shopCartDropdown__notice" role="status">{checkoutNotice}</p>}
                        <div className="shopCartDropdown__actions">
                            <button
                                type="button"
                                className="shopCard__addToCart shopCartDropdown__checkout"
                                data-testid="shop-cart-checkout"
                                disabled={checkoutDisabled}
                                onClick={onCheckout}
                            >
                                {isSubmitting ? "Processing checkout..." : !isAuthenticated ? "Sign in to checkout" : "Checkout"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
