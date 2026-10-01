/*
 * Purpose: Public merchandise storefront. Renders the catalog grid and hero from the
 *          site-wide shop cart; cart state, drawer, and checkout live in ShopCartContext
 *          so the cart is available on every page.
 * Authentication/Authorization Requirements: Browsing the catalog and building a cart are public.
 *          Checkout requires an authenticated session via useAuthContext().signIn() before dispatching to Stripe.
 * Expected Request Information: Catalog and cart state from useShopCart().
 * Expected Response Information: Hero, collection grid, and Stripe return banners.
 */

import { useState, useEffect, useMemo } from "react";
import { shopProducts } from "../assets/data/ShopData";
import { useAuthContext } from "../context/AuthContext";
import { useShopCart } from "../context/ShopCartContext";
import { QuantityInput } from "../components/ShopCart";
import { formatCents, formatDate } from "../utils/shopFormat";

function ShopHeroCarousel() {
    const [{ currentIndex, outgoingIndex }, setSlide] = useState({ currentIndex: 0, outgoingIndex: null });

    useEffect(() => {
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

        const interval = window.setInterval(() => {
            setSlide(({ currentIndex }) => ({
                outgoingIndex: currentIndex,
                currentIndex: (currentIndex + 1) % shopProducts.length,
            }));
        }, 5000);
        return () => window.clearInterval(interval);
    }, []);

    return (
        <div className="shopPage__heroVisual">
            {outgoingIndex !== null && (
                <div className="shopPage__heroSlide shopPage__heroSlide--outgoing" aria-hidden="true">
                    <img src={shopProducts[outgoingIndex].image} alt="" decoding="async" />
                    <span className="shopPage__heroCaption">{shopProducts[outgoingIndex].name}</span>
                </div>
            )}
            <div key={currentIndex} className={`shopPage__heroSlide${outgoingIndex !== null ? " shopPage__heroSlide--incoming" : ""}`}
                onAnimationEnd={() => setSlide(slide => ({ ...slide, outgoingIndex: null }))}>
                <img src={shopProducts[currentIndex].image} alt={`${shopProducts[currentIndex].name} product mockup`} decoding="async" />
                <span className="shopPage__heroCaption">{shopProducts[currentIndex].name}</span>
            </div>
        </div>
    );
}

function ShopPage() {
    const auth = useAuthContext();
    const isAuthenticated = auth?.isAuthenticated || false;
    const {
        cart,
        catalog,
        catalogLoading: loading,
        catalogError: error,
        retryCatalog,
        ensureCatalog,
        addItem,
        setItemQuantity,
        checkoutParam,
        checkoutSessionId,
        returnStatus,
        reconcileNotice,
    } = useShopCart();

    const [selectedSizes, setSelectedSizes] = useState({});
    const [awaitingSizeSku, setAwaitingSizeSku] = useState(null);

    const productBySku = useMemo(() => {
        const map = new Map();
        for (const product of shopProducts) {
            if (product.sku) {
                map.set(product.sku, product);
            }
        }
        return map;
    }, []);

    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    useEffect(() => {
        ensureCatalog();
    }, [ensureCatalog]);

    const getSizeQuantity = (sku, size) =>
        cart.find((line) => line.sku === sku && line.size === size)?.quantity || 0;

    const handleAddToCart = (item, size) => {
        if (!size) {
            setAwaitingSizeSku(item.sku);
            return;
        }
        addItem(item, size);
    };

    return (
        <>
            <div className="baseContainer">
                <main className="shopPage">
                <section className="shopPage__hero" aria-labelledby="shop-title">
                    <div className="shopPage__heroTop">
                        <span>Informatics Merch</span>
                        <span>Fall collection</span>
                    </div>
                    <div className="shopPage__heroContent">
                        <div className="shopPage__heroIntro">
                            <h1 id="shop-title">The Informatics <span>Fall Collection.</span></h1>
                            <div className="shopPage__saleInfo" role="status">
                                {catalog && catalog.saleState !== "open" && (
                                    <span>
                                        {catalog.saleState === "scheduled" ? "Orders open" : "Ordering ended"}{" "}
                                        <strong>{formatDate(catalog.saleState === "scheduled" ? catalog.opensAt : catalog.closesAt)}</strong>
                                    </span>
                                )}
                            </div>
                        </div>
                        <ShopHeroCarousel />
                    </div>
                    <div className="shopPage__heroBottom" aria-hidden="true">Informatics Undergraduate Association</div>
                </section>

                {checkoutParam === "complete" && returnStatus !== "paid" && (
                    <div className="shopPage__banner shopPage__banner--complete" role="status">
                        {returnStatus === "paid-cart-missing" && <p>Payment confirmed, but we could not match your cart to this checkout. Please review it before buying again or contact the IUGA officers.</p>}
                        {returnStatus === "unconfirmed" && <p>We could not confirm payment yet. Your cart is still here. Please check your payment in Stripe or contact the IUGA officers before trying again.</p>}
                        {returnStatus === "checking" && <p>{!checkoutSessionId ? "We could not identify this checkout. Check your payment before trying again or contact the IUGA officers." : isAuthenticated ? "Checking your payment with Stripe..." : "Sign in to confirm your payment before checking out again."}</p>}
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
                            onClick={() => retryCatalog()}
                        >
                            Try again
                        </button>
                    </div>
                )}

                {catalog && (
                    <>
                        <section className="shopPage__collection" aria-labelledby="collection-title">
                            <div className="shopPage__collectionHeader">
                                <h2 id="collection-title">The Fall Collection</h2>
                                <div className="shopPage__collectionCount">
                                    <p>{catalog.items.length} {catalog.items.length === 1 ? "item" : "items"}</p>
                                </div>
                            </div>

                            <div className="shopPage__grid">
                                {catalog.items.map((item) => {
                                    const product = productBySku.get(item.sku);
                                    const formattedPrice = formatCents(item.unitPriceCents);
                                    const oneSize = item.sizes.length === 1 && item.sizes[0] === "One Size";
                                    const selectedSize = oneSize ? "One Size" : selectedSizes[item.sku] || cart.find((line) => line.sku === item.sku)?.size;
                                    const selectedQuantity = selectedSize ? getSizeQuantity(item.sku, selectedSize) : 0;

                                    return (
                                        <article className="shopCard" key={item.sku}>
                                            {product?.image && (
                                                <div className="shopCard__imageWrap">
                                                    <img
                                                        src={product.image}
                                                        alt={`${item.name} product mockup`}
                                                        loading="lazy"
                                                        decoding="async"
                                                    />
                                                </div>
                                            )}
                                            <div className="shopCard__details">
                                                <div className="shopCard__info">
                                                    <h3>{item.name}</h3>
                                                    <p className="shopCard__price">{formattedPrice}</p>
                                                </div>

                                                <div className="shopCard__controls">
                                                    {!oneSize && (
                                                        <div className="shopCard__controlGroup">
                                                            <span className="shopCard__label" id={`sizes-${item.sku}`}>Choose size</span>
                                                            <div className="shopCard__sizeOptions" role="group" aria-labelledby={`sizes-${item.sku}`}>
                                                                {item.sizes.map((size) => {
                                                                    const quantity = getSizeQuantity(item.sku, size);
                                                                    return (
                                                                        <button
                                                                            key={size}
                                                                            type="button"
                                                                            className={`shopCard__sizePill ${selectedSize === size ? "is-selected" : ""} ${quantity ? "is-in-cart" : ""}`}
                                                                            aria-pressed={selectedSize === size}
                                                                            aria-label={`${size}${quantity ? `, ${quantity} in cart` : ""}`}
                                                                            onClick={() => {
                                                                                setSelectedSizes((previous) => ({ ...previous, [item.sku]: size }));
                                                                                setAwaitingSizeSku(null);
                                                                            }}
                                                                        >
                                                                            {size}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {awaitingSizeSku === item.sku && (
                                                        <p className="shopCard__sizePrompt" role="alert">Choose a size before adding to cart.</p>
                                                    )}
                                                    {selectedQuantity > 0 ? (
                                                        <div className="shopCard__cartPill">
                                                            <QuantityInput
                                                                label={`${item.name}${oneSize ? "" : ` ${selectedSize}`}`}
                                                                quantity={selectedQuantity}
                                                                removeAtOne
                                                                onDecrease={() => setItemQuantity(item.sku, selectedSize, selectedQuantity - 1)}
                                                                onIncrease={() => setItemQuantity(item.sku, selectedSize, selectedQuantity + 1)}
                                                                onQuantityChange={(value) => setItemQuantity(item.sku, selectedSize, value)}
                                                            />
                                                        </div>
                                                    ) : (
                                                        <button type="button" className="shopCard__addToCart" onClick={() => handleAddToCart(item, selectedSize)}>
                                                            Add to cart
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        </section>

                    </>
                )}
                </main>
            </div>
        </>
    );
}

export default ShopPage;
