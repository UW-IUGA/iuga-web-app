/*
Purpose: Venmo checkout page for one held cart. Shows the IUGA Venmo handle, each line, the exact total,
         and a 15-minute countdown. The student enters a Venmo username, then confirms or cancels.
Authentication/Authorization Requirements: Logged in. The hold must belong to the signed-in student.
Expected Request Information: URL parameter holdId. Calls GET, PATCH, and DELETE /api/v1/shop/holds/:holdId
  and POST /api/v1/shop/holds/:holdId/confirm.
Expected Response Information: Hold details, the pending purchase, or a clear notice for expired,
  missing, closed, or failed holds.
*/

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthContext } from "../context/AuthContext";
import { useShopCart } from "../context/ShopCartContext";
import { formatCents } from "../utils/shopFormat";

const VENMO_HANDLE = "IUGA-UW";
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,30}$/;
const GENERIC_FAILURE = "Something went wrong. Please try again.";

function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

async function readJson(response) {
    return response.json().catch(() => null);
}

export default function ShopCheckoutPage() {
    const { holdId } = useParams();
    const navigate = useNavigate();
    const { signIn } = useAuthContext();
    const { clearCart, removeItem } = useShopCart();

    const [loadState, setLoadState] = useState("loading");
    const [loadMessage, setLoadMessage] = useState(null);
    const [hold, setHold] = useState(null);
    const [purchase, setPurchase] = useState(null);
    const [venmoUsername, setVenmoUsername] = useState("");
    const [usernameError, setUsernameError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [isBusy, setIsBusy] = useState(false);
    const [nowMs, setNowMs] = useState(() => Date.now());

    const loadHold = useCallback(async () => {
        setLoadState("loading");
        try {
            const response = await fetch(`/api/v1/shop/holds/${encodeURIComponent(holdId)}`);
            if (response.status === 401) {
                setLoadState("signin");
                return;
            }
            if (response.status === 404) {
                setLoadState("missing");
                return;
            }
            if (response.status === 503) {
                const body = await readJson(response);
                setLoadMessage(body?.message ?? null);
                setLoadState("closed");
                return;
            }
            if (!response.ok) {
                setLoadState("error");
                return;
            }
            const data = await response.json();
            setHold(data.hold);
            setLoadState("ready");
        } catch {
            setLoadState("error");
        }
    }, [holdId]);

    useEffect(() => {
        loadHold();
    }, [loadHold]);

    useEffect(() => {
        if (!hold || hold.status !== "active") return undefined;
        const timer = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [hold]);

    const remainingMs = hold ? new Date(hold.expiresAt).getTime() - nowMs : 0;
    const isExpired = hold !== null && (hold.status === "expired" || (hold.status === "active" && remainingMs <= 0));
    const isOpen = hold !== null && hold.status === "active" && !isExpired && !purchase;

    async function handleConfirm(event) {
        event.preventDefault();
        const username = venmoUsername.trim().replace(/^@/, "");
        if (!USERNAME_PATTERN.test(username)) {
            setUsernameError("Enter your Venmo username: 1 to 30 letters, numbers, periods, hyphens, or underscores.");
            return;
        }
        setUsernameError(null);
        setNotice(null);
        setIsBusy(true);
        try {
            const response = await fetch(`/api/v1/shop/holds/${encodeURIComponent(holdId)}/confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ venmoUsername: username }),
            });
            const body = await readJson(response);
            if (response.ok && body?.purchase) {
                setPurchase(body.purchase);
                clearCart();
                return;
            }
            setNotice(body?.message ?? GENERIC_FAILURE);
            if (response.status === 409) {
                await loadHold();
            }
        } catch {
            setNotice(GENERIC_FAILURE);
        } finally {
            setIsBusy(false);
        }
    }

    async function handleCancel() {
        setNotice(null);
        setIsBusy(true);
        try {
            const response = await fetch(`/api/v1/shop/holds/${encodeURIComponent(holdId)}`, { method: "DELETE" });
            if (response.ok) {
                navigate("/shop");
                return;
            }
            const body = await readJson(response);
            setNotice(body?.message ?? GENERIC_FAILURE);
        } catch {
            setNotice(GENERIC_FAILURE);
        } finally {
            setIsBusy(false);
        }
    }

    async function handleRemoveLine(line) {
        setNotice(null);
        setIsBusy(true);
        try {
            const response = await fetch(`/api/v1/shop/holds/${encodeURIComponent(holdId)}/lines`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sku: line.sku, size: line.size }),
            });
            const body = await readJson(response);
            if (!response.ok) {
                setNotice(body?.message ?? GENERIC_FAILURE);
                return;
            }
            // The student removed this line on purpose, so it also leaves the bag.
            removeItem(line.sku, line.size);
            setHold(body.hold);
            if (body.hold.status === "cancelled") {
                setNotice("That was the last item, so your hold is cancelled. Your bag is empty.");
            }
        } catch {
            setNotice(GENERIC_FAILURE);
        } finally {
            setIsBusy(false);
        }
    }

    if (loadState === "loading") {
        return <main className="shopCheckout baseContainer" role="status">Loading your checkout…</main>;
    }

    if (loadState === "signin") {
        return (
            <main className="shopCheckout baseContainer">
                <h1>Sign in to continue</h1>
                <p>Sign in to see your held items and finish your purchase.</p>
                <button type="button" className="shopCheckout__button" onClick={async () => {
                    const user = typeof signIn === "function" ? await signIn() : null;
                    if (user) loadHold();
                }}>
                    Sign in
                </button>
            </main>
        );
    }

    if (loadState === "missing") {
        return (
            <main className="shopCheckout baseContainer">
                <h1>We couldn’t find this checkout</h1>
                <p><Link to="/shop">Return to the shop</Link></p>
            </main>
        );
    }

    if (loadState === "closed") {
        return (
            <main className="shopCheckout baseContainer">
                <h1>Checkout is unavailable</h1>
                <p>{loadMessage ?? "Online checkout is temporarily unavailable. Your cart has not changed; please check back later."}</p>
                <p><Link to="/shop">Return to the shop</Link></p>
            </main>
        );
    }

    if (loadState === "error") {
        return (
            <main className="shopCheckout baseContainer">
                <h1>Checkout could not load</h1>
                <p>{GENERIC_FAILURE}</p>
                <button type="button" className="shopCheckout__button" onClick={loadHold}>Try again</button>
            </main>
        );
    }

    if (purchase) {
        return (
            <main className="shopCheckout baseContainer">
                <h1>Purchase submitted</h1>
                <p>
                    Your purchase is pending review. Send {formatCents(purchase.totalCents)} to {VENMO_HANDLE} on Venmo.
                </p>
                <p><Link to="/shop">Back to the shop</Link></p>
            </main>
        );
    }

    const secondsLeft = formatCountdown(remainingMs);

    return (
        <main className="shopCheckout baseContainer">
            <h1>Checkout</h1>

            {isExpired && (
                <p role="alert">
                    This hold has expired and its items were released. Your bag is unchanged.{" "}
                    <Link to="/shop">Return to the shop</Link> to start again.
                </p>
            )}
            {isOpen && <p>Your items are held for <strong>{secondsLeft}</strong>.</p>}
            {hold.status === "confirmed" && <p>This checkout is confirmed. Your purchase is pending review.</p>}
            {hold.status === "cancelled" && <p>This checkout was cancelled. Your items were released.</p>}

            <ul className="shopCheckout__lines">
                {hold.lines.map((line) => (
                    <li key={`${line.sku}:${line.size}`} className="shopCheckout__line">
                        <span>{line.quantity} × {line.name}, size {line.size}</span>
                        <span>{formatCents(line.unitPriceCents * line.quantity)}</span>
                        {isOpen && (
                            <button
                                type="button"
                                className="shopCheckout__button shopCheckout__button--quiet"
                                onClick={() => handleRemoveLine(line)}
                                disabled={isBusy}
                                aria-label={`Remove ${line.name}, size ${line.size}`}
                            >
                                Remove
                            </button>
                        )}
                    </li>
                ))}
            </ul>

            <p className="shopCheckout__total">
                Total due: <strong>{formatCents(hold.totalCents)}</strong>
            </p>

            {isOpen && (
                <p>
                    Pay {formatCents(hold.totalCents)} to <strong>{VENMO_HANDLE}</strong> on Venmo, then enter your Venmo
                    username and confirm.
                </p>
            )}

            {isOpen && (
                <form onSubmit={handleConfirm} noValidate>
                    <label htmlFor="shopCheckoutVenmo">Your Venmo username</label>
                    <input
                        id="shopCheckoutVenmo"
                        type="text"
                        autoComplete="off"
                        value={venmoUsername}
                        onChange={(event) => setVenmoUsername(event.target.value)}
                        aria-invalid={usernameError ? "true" : undefined}
                        aria-describedby={usernameError ? "shopCheckoutVenmoError" : undefined}
                        disabled={isBusy}
                    />
                    {usernameError && (
                        <p id="shopCheckoutVenmoError" className="shopCheckout__error">{usernameError}</p>
                    )}
                    <div className="shopCheckout__actions">
                        <button type="submit" className="shopCheckout__button" disabled={isBusy}>
                            Confirm purchase
                        </button>
                        <button
                            type="button"
                            className="shopCheckout__button shopCheckout__button--quiet"
                            onClick={handleCancel}
                            disabled={isBusy}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {notice && <p role="status" className="shopCheckout__error">{notice}</p>}
        </main>
    );
}
