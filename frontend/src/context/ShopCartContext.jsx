/*
 * Purpose: Site-wide merchandise cart state. Owns the cart, catalog fetching with
 *          session cache, Stripe checkout handoff, and the navbar trigger + cart
 *          dropdown portals so the cart is available on every page, not just /shop.
 * Authentication/Authorization Requirements: Browsing and building a cart are public.
 *          Checkout requires an authenticated session via useAuthContext().signIn().
 * Expected Request Information: Consumers read cart/catalog/checkout state and call
 *          mutators; the trigger portals into #shop-cart-slot, the cart dropdown into body.
 * Expected Response Information: Context value with cart, catalog, cart dropdown, and checkout controls.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useAuthContext } from "./AuthContext";
import {
    addToCart,
    removeFromCart,
    setCartQuantity,
    reconcileCart,
    parseCart,
    MAX_QUANTITY,
} from "../utils/shopCart";
import { CartTrigger, ShopCartDropdown } from "../components/ShopCart";

const CART_STORAGE_KEY = "iuga_shop_cart";
const CATALOG_CACHE_KEY = "iuga_shop_catalog";
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const PROCESSED_CHECKOUT_CART = "processed";
const CHECKOUT_UNAVAILABLE_MESSAGE = "Online checkout is temporarily unavailable. Your cart has not changed; please check back later.";

/**
 * @behavior Builds the sessionStorage key holding the cart handed to Stripe
 *           for one checkout session, so the paid-return verifier reads back
 *           the exact cart the handoff wrote. After processing, this key holds
 *           a sentinel preventing repeat subtraction across reloads in this tab.
 */
export function checkoutCartKey(sessionId) {
    return `iuga_shop_checkout_${sessionId}`;
}

const ShopCartContext = createContext(null);

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

/**
 * @behavior Reads the cached shop catalog when it is still within its TTL.
 * @returns {object|null} The cached catalog, or null on a miss or stale entry.
 */
function readCachedCatalog() {
    try {
        const raw = window.sessionStorage.getItem(CATALOG_CACHE_KEY);
        if (!raw) return null;
        const { timestamp, catalog } = JSON.parse(raw);
        if (!catalog || typeof timestamp !== "number") return null;
        if (Date.now() - timestamp > CATALOG_CACHE_TTL_MS) return null;
        return catalog;
    } catch {
        return null;
    }
}

/**
 * @behavior Writes the shop catalog to the session cache with a fresh timestamp.
 * @param {object} catalog
 */
function writeCachedCatalog(catalog) {
    try {
        window.sessionStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ timestamp: Date.now(), catalog }));
    } catch {
        // Storage restricted or unavailable
    }
}

export function ShopCartProvider({ children }) {
    const auth = useAuthContext();
    const isAuthenticated = auth?.isAuthenticated || false;
    const signIn = auth?.signIn;

    const [catalog, setCatalog] = useState(readCachedCatalog);
    const [loading, setLoading] = useState(() => readCachedCatalog() === null);
    const [error, setError] = useState(null);

    const [cart, setCart] = useState(() => readStoredCart());
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [cartHost, setCartHost] = useState(null);

    const [checkoutNotice, setCheckoutNotice] = useState(null);
    const [returnStatus, setReturnStatus] = useState("checking");
    const [reconcileNotice, setReconcileNotice] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const submittingRef = useRef(false);
    // Avoid processing a paid session again in this mount. The stored sentinel
    // covers full reloads, which still require fresh server verification.
    const verifiedSessionsRef = useRef(new Set());

    const [searchParams] = useSearchParams();
    const checkoutParam = searchParams.get("checkout");
    const checkoutSessionId = searchParams.get("session_id");
    // Last-added line pinning the cart dropdown's top and bottom borders. The borders
    // survive closes so a reopened cart dropdown still shows which line was added
    // last; only the confirmation behavior below is transient.
    const [lastAdded, setLastAdded] = useState(null);
    // True only for a fresh add: drives the transient auto-dismiss and the
    // screen-reader confirmation. Cleared on any close; the borders stay.
    const [freshAdd, setFreshAdd] = useState(false);
    const closeCart = useCallback(() => {
        setIsCartOpen(false);
        setFreshAdd(false);
    }, []);

    const catalogRef = useRef(catalog);
    useEffect(() => {
        catalogRef.current = catalog;
    }, [catalog]);

    const fetchInFlightRef = useRef(false);
    const lastFetchRef = useRef(0);
    const SILENT_REVALIDATE_MIN_MS = 60 * 1000;

    const fetchCatalog = useCallback(async (isSilent = false, force = false) => {
        // Dedupe concurrent fetches (provider + page mount at once) and skip a
        // silent revalidation when data was just fetched (e.g. cart dropdown opened
        // right after page load). A missing catalog always triggers a full load.
        // `force` bypasses that window for a refresh that cannot wait, such as a
        // checkout the server rejected for a stale catalog.
        if (fetchInFlightRef.current) return;
        if (isSilent && !force && Date.now() - lastFetchRef.current < SILENT_REVALIDATE_MIN_MS) return;
        fetchInFlightRef.current = true;
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
            writeCachedCatalog(data.catalog);
            lastFetchRef.current = Date.now();

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
            fetchInFlightRef.current = false;
            if (!isSilent) {
                setLoading(false);
            }
        }
    }, []);

    /**
     * @behavior Ensures catalog data is available, fetching only when needed:
     * a fresh cache renders as-is with a silent revalidation, otherwise a full load.
     */
    const ensureCatalog = useCallback(() => {
        fetchCatalog(catalogRef.current !== null);
    }, [fetchCatalog]);

    // Returning shoppers with items get prices fresh without visiting /shop first.
    const storedCartRef = useRef(cart);
    useEffect(() => {
        if (storedCartRef.current.length > 0) {
            ensureCatalog();
        }
    }, [ensureCatalog]);

    useEffect(() => {
        if (isCartOpen) {
            ensureCatalog();
        }
    }, [isCartOpen, ensureCatalog]);

    useEffect(() => {
        if (checkoutParam !== "complete" || !isAuthenticated || !checkoutSessionId) return undefined;
        if (verifiedSessionsRef.current.has(checkoutSessionId)) return undefined;
        let active = true;

        async function verifyCheckout() {
            try {
                const response = await fetch(`/api/v1/shop/checkout/${encodeURIComponent(checkoutSessionId)}`);
                if (!response.ok) throw new Error("Checkout verification failed");
                const result = await response.json();
                if (!active) return;
                if (result.paymentStatus !== "paid") {
                    setReturnStatus("unconfirmed");
                    return;
                }

                const savedCartKey = checkoutCartKey(checkoutSessionId);
                const savedCart = window.sessionStorage.getItem(savedCartKey);
                if (savedCart === PROCESSED_CHECKOUT_CART) {
                    verifiedSessionsRef.current.add(checkoutSessionId);
                    setReturnStatus("paid");
                    return;
                }
                if (!savedCart) {
                    setReturnStatus("paid-cart-missing");
                    return;
                }

                const purchased = parseCart(savedCart);
                if (purchased.length === 0) {
                    setReturnStatus("paid-cart-missing");
                    return;
                }

                let remaining = parseCart(window.sessionStorage.getItem(CART_STORAGE_KEY));
                for (const line of purchased) {
                    const current = remaining.find((item) => item.sku === line.sku && item.size === line.size);
                    if (current) {
                        remaining = setCartQuantity(remaining, line.sku, line.size, current.quantity - line.quantity);
                    }
                }
                // Record consumption before changing the cart: if storage fails,
                // a later return must not subtract newly added items a second time.
                window.sessionStorage.setItem(savedCartKey, PROCESSED_CHECKOUT_CART);
                window.sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(remaining));
                verifiedSessionsRef.current.add(checkoutSessionId);
                setCart(remaining);
                setReturnStatus("paid");
            } catch {
                if (active) setReturnStatus("unconfirmed");
            }
        }

        verifyCheckout();
        return () => { active = false; };
    }, [checkoutParam, isAuthenticated, checkoutSessionId]);

    useEffect(() => {
        setCartHost(document.getElementById("shop-cart-slot"));
    }, []);

    const updateCart = useCallback((nextCart) => {
        setCart(nextCart);
        writeStoredCart(nextCart);
    }, []);

    // Adding shows the cart dropdown as a transient confirmation instead of
    // auto-opening a persistent panel.
    const addItem = useCallback((item, size) => {
        updateCart(addToCart(readStoredCart(), { sku: item.sku, size, quantity: 1 }));
        setLastAdded({ sku: item.sku, size });
        setFreshAdd(true);
        setIsCartOpen(true);
    }, [updateCart]);

    const setItemQuantity = useCallback((sku, size, quantity) => {
        // The bag and card steppers share this path, so the 100 ceiling the quantity
        // field advertises holds for the +/- buttons too.
        updateCart(setCartQuantity(readStoredCart(), sku, size, Math.min(quantity, MAX_QUANTITY)));
    }, [updateCart]);

    const removeItem = useCallback((sku, size) => {
        updateCart(removeFromCart(readStoredCart(), sku, size));
    }, [updateCart]);

    const handleCheckout = useCallback(async () => {
        if (submittingRef.current || isSubmitting) return;
        const currentCart = readStoredCart();
        const currentCatalog = catalogRef.current;
        if (!currentCatalog || currentCatalog.saleState !== "open" || currentCart.length === 0) return;

        setCheckoutNotice(null);
        submittingRef.current = true;
        setIsSubmitting(true);

        if (!isAuthenticated) {
            let user = null;
            try {
                user = typeof signIn === "function" ? await signIn() : null;
            } catch {
                user = null;
            }
            if (!user) {
                // Sign-in was canceled or failed: release the submit guard so checkout
                // is usable again instead of staying stuck on "Processing checkout...".
                submittingRef.current = false;
                setIsSubmitting(false);
                return;
            }
        }

        const postCheckout = async () => {
            return fetch("/api/v1/shop/checkout", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    catalogVersion: currentCatalog.catalogVersion,
                    items: currentCart.map((line) => ({
                        sku: line.sku,
                        size: line.size,
                        quantity: line.quantity,
                    })),
                }),
            });
        };

        try {
            let response = await postCheckout();

            if (response.status === 401) {
                // The server session expired. Run interactive sign-in to establish a fresh backend session.
                if (typeof signIn === "function") {
                    const reauthenticatedUser = await signIn();
                    if (reauthenticatedUser) {
                        response = await postCheckout();
                    } else {
                        setCheckoutNotice("Your session expired. Please sign in again to check out.");
                        return;
                    }
                } else {
                    setCheckoutNotice("Please sign in again to check out.");
                    return;
                }
            }

            if (response.status === 200) {
                const data = await response.json();
                if (data.url && data.sessionId) {
                    window.sessionStorage.setItem(checkoutCartKey(data.sessionId), JSON.stringify(currentCart));
                    // The bag stays open on every failure so its notice is visible;
                    // it closes only here, on the way out to Stripe.
                    closeCart();
                    if (typeof window.location.assign === "function") {
                        window.location.assign(data.url);
                    } else {
                        window.location.href = data.url;
                    }
                    return;
                }
                setCheckoutNotice("Unable to start checkout. Please try again later.");
                return;
            }

            if (response.status === 503) {
                // The server explains why checkout is closed; use the fixed notice when it sends no message.
                const body = await response.json().catch(() => null);
                const hasServerMessage = typeof body?.message === "string" && body.message.trim() !== "";
                setCheckoutNotice(hasServerMessage ? body.message : CHECKOUT_UNAVAILABLE_MESSAGE);
                return;
            }

            if (response.status === 409) {
                await fetchCatalog(true, true);
                setCheckoutNotice(
                    "The catalog has updated or the sale status changed. Please review your cart and confirm your order again."
                );
                return;
            }

            if (response.status === 401) {
                // A second 401 after re-authentication ends with the notice rather than looping.
                setCheckoutNotice("Your session expired. Please sign in again to check out.");
                return;
            }

            setCheckoutNotice("Unable to start checkout. Please try again later.");
        } catch {
            setCheckoutNotice("Unable to start checkout. Please try again later.");
        } finally {
            submittingRef.current = false;
            setIsSubmitting(false);
        }
    }, [closeCart, fetchCatalog, isAuthenticated, isSubmitting, signIn]);

    const totalQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);

    const value = useMemo(() => ({
        cart,
        totalQuantity,
        catalog,
        catalogLoading: loading,
        catalogError: error,
        retryCatalog: () => fetchCatalog(false),
        ensureCatalog,
        addItem,
        setItemQuantity,
        removeItem,
        isCartOpen,
        setIsCartOpen,
        checkoutParam,
        checkoutSessionId,
        returnStatus,
        reconcileNotice,
        checkoutNotice,
        isSubmitting,
        handleCheckout,
    }), [
        cart, totalQuantity, catalog, loading, error, fetchCatalog, ensureCatalog,
        addItem, setItemQuantity, removeItem, isCartOpen, checkoutParam,
        checkoutSessionId, returnStatus, reconcileNotice, checkoutNotice,
        isSubmitting, handleCheckout,
    ]);

    // The trigger toggles the cart dropdown; closing from the trigger cancels the
    // transient confirmation but leaves the last-added line marked so
    // a reopened cart dropdown still shows which line was added last.
    const toggleCart = useCallback(() => {
        setFreshAdd(false);
        setIsCartOpen((open) => !open);
    }, []);

    // Stable checkout callback so the transient fade timer isn't reset by renders.
    // The bag stays open while checkout runs so failure notices render in place.
    const startCheckout = useCallback(() => {
        handleCheckout();
    }, [handleCheckout]);

    return (
        <ShopCartContext.Provider value={value}>
            {cartHost && createPortal(
                <CartTrigger
                    totalQuantity={totalQuantity}
                    isCartOpen={isCartOpen}
                    onToggle={toggleCart}
                />,
                cartHost
            )}
            {isCartOpen && createPortal(
                <ShopCartDropdown
                    lastAdded={lastAdded}
                    freshAdd={freshAdd}
                    cart={cart}
                    catalog={catalog}
                    catalogLoading={loading}
                    catalogError={error}
                    totalQuantity={totalQuantity}
                    checkoutParam={checkoutParam}
                    checkoutNotice={checkoutNotice}
                    isAuthenticated={isAuthenticated}
                    isSubmitting={isSubmitting}
                    onCheckout={startCheckout}
                    onQuantityChange={setItemQuantity}
                    onRemove={removeItem}
                    onClose={closeCart}
                />,
                document.body
            )}
            {children}
        </ShopCartContext.Provider>
    );
};

/**
 * @behavior Reads the site-wide shop cart context. Must be used under ShopCartProvider.
 * @returns {object} Cart, catalog, cart dropdown, and checkout controls.
 */
export function useShopCart() {
    const context = useContext(ShopCartContext);
    if (!context) {
        throw new Error("useShopCart must be used within a ShopCartProvider");
    }
    return context;
}
