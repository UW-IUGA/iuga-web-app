/*
Purpose: Venmo checkout page for one held cart. Shows the IUGA Venmo handle, each line, the exact total,
         and a countdown. The student enters a Venmo username, then confirms or cancels.
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
import venmoQrCode from "../assets/shop/venmo-qr.webp";
import EmailContactDialog from "../components/EmailContactDialog";

const VENMO_HANDLE = "IUGA-UW";
const IUGA_CONTACT_EMAIL = "iuga@uw.edu";
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,30}$/;
const PHONE_NUMBER_PATTERN = /^\+?\d{7,15}$/;
const GENERIC_FAILURE = "Something went wrong. Please try again.";

function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeUsername(value) {
    return value.trim().replace(/^@/, "").toLowerCase();
}

function normalizePhone(value) {
    return value.replace(/[\s().-]/g, "");
}

/**
 * @behavior Returns the reason a Venmo username field cannot be used yet, or null when it is valid.
 */
function usernameProblem(value) {
    if (value.trim() === "") return "Enter your Venmo username.";
    return USERNAME_PATTERN.test(normalizeUsername(value)) ? null : "Use 1 to 30 letters, numbers, periods, hyphens, or underscores.";
}

/**
 * @behavior Returns the reason a phone field cannot be used yet, or null when it is a US or international number.
 */
function phoneProblem(value) {
    if (value.trim() === "") return "Enter your phone number.";
    return PHONE_NUMBER_PATTERN.test(normalizePhone(value)) ? null : "Use 7 to 15 digits. Add your country code if it isn’t a US number.";
}

/**
 * @behavior Prefills the email for a student who wants a different Venmo username than the one saved
 *           by their earlier purchase. Only IUGA can change it.
 */
function usernameChangeEmailDraft(savedUsername, requestedUsername) {
    return {
        recipient: IUGA_CONTACT_EMAIL,
        subject: "Change the Venmo username on my account",
        body: [
            "Hi IUGA,",
            "",
            "I'd like to change the Venmo username on my account.",
            "",
            `Current Venmo username: ${savedUsername}`,
            `New Venmo username: ${requestedUsername}`,
            "",
            "Thanks,",
            "[Your name]",
        ].join("\n"),
    };
}

/**
 * @behavior Prefills the email for a student whose hold expired after they paid on Venmo but before they
 *           confirmed. IUGA verifies those payments by hand.
 */
function paymentEmailDraft(hold) {
    const items = hold.lines.map((line) => `- ${line.quantity} × ${line.name}, size ${line.size}`).join("\n");
    return {
        recipient: IUGA_CONTACT_EMAIL,
        subject: "I paid on Venmo but my checkout timed out",
        body: [
            "Hi IUGA,",
            "",
            "My checkout hold expired before I could confirm it in the app, but I already paid on Venmo.",
            "",
            `Hold ID: ${hold.id}`,
            `Total: ${formatCents(hold.totalCents)}`,
            "Items:",
            items,
            "",
            "Venmo username: [your Venmo username]",
            "Date I paid: [date]",
            "",
            "Thanks,",
            "[Your name]",
        ].join("\n"),
    };
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
    // The username saved by an earlier purchase. Checkout must use the same one.
    const [savedVenmoUsername, setSavedVenmoUsername] = useState(null);
    const [phoneNumber, setPhoneNumber] = useState("");
    // A field shows its reason once the student has left it, so the first render is not all red.
    const [touched, setTouched] = useState({ username: false, phone: false });
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
            const savedUsername = data.savedVenmoUsername ?? null;
            setSavedVenmoUsername(savedUsername);
            if (savedUsername) {
                setVenmoUsername((current) => (current === "" ? savedUsername : current));
            }
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

    const usernameError = touched.username ? usernameProblem(venmoUsername) : null;
    const phoneError = touched.phone ? phoneProblem(phoneNumber) : null;
    const usernameMismatch =
        savedVenmoUsername !== null &&
        usernameProblem(venmoUsername) === null &&
        normalizeUsername(venmoUsername) !== savedVenmoUsername;
    // Confirm stays disabled until both required fields are valid and the username matches the saved one.
    const canConfirm = usernameProblem(venmoUsername) === null && phoneProblem(phoneNumber) === null && !usernameMismatch;

    async function handleConfirm(event) {
        event.preventDefault();
        if (!canConfirm || isBusy) {
            return;
        }
        setNotice(null);
        setIsBusy(true);
        try {
            const response = await fetch(`/api/v1/shop/holds/${encodeURIComponent(holdId)}/confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ venmoUsername: normalizeUsername(venmoUsername), phoneNumber: normalizePhone(phoneNumber) }),
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
                setNotice("That was the last item, so your hold is cancelled. Your cart is empty.");
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
                <h1>Your purchase is submitted</h1>
                <section className="shopCheckout__submitted" aria-labelledby="shopCheckoutSubmittedTitle">
                    <h2 id="shopCheckoutSubmittedTitle">Thanks for buying Informatics merch!</h2>
                    <p>We’ll contact you when your merch is ready for pickup.</p>
                    <p className="shopCheckout__submittedNote">
                        If you haven’t sent{" "}
                        <strong>{formatCents(purchase.totalCents)}</strong> to <strong>@{VENMO_HANDLE}</strong> yet,
                        send it now.
                    </p>
                    <Link className="shopCard__addToCart shopCheckout__pillLink" to="/shop">Back to the shop</Link>
                </section>
            </main>
        );
    }

    const secondsLeft = formatCountdown(remainingMs);

    return (
        <main className="shopCheckout baseContainer">
            <div className="shopCheckout__header">
                <h1>Checkout</h1>
                {isOpen && (
                    <p className={`shopCheckout__timer${remainingMs <= 60000 ? " shopCheckout__timer--urgent" : ""}`}>
                        <span>Time remaining</span>
                        <strong>{secondsLeft}</strong>
                    </p>
                )}
            </div>

            {isExpired && (
                <section className="shopCheckout__expired" role="alert" aria-labelledby="shopCheckoutExpiredTitle">
                    <h2 id="shopCheckoutExpiredTitle">Your checkout timed out</h2>
                    <p>Your hold ended, so these items were released. Your cart is still saved.</p>
                    <Link className="shopCard__addToCart shopCheckout__pillLink" to="/shop">
                        Start again from the shop
                    </Link>
                    <div className="shopCheckout__expiredPaid">
                        <p className="shopCheckout__expiredQuestion">Already paid on Venmo?</p>
                        <p>Email IUGA so we can look into your payment.</p>
                        <EmailContactDialog
                            draft={paymentEmailDraft(hold)}
                            contextLabel="IUGA Shop"
                            title="Email IUGA about your payment"
                            triggerLabel="Email IUGA"
                        />
                    </div>
                </section>
            )}
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
                <section className="shopCheckout__pay" aria-labelledby="shopCheckoutPayTitle">
                    <h2 id="shopCheckoutPayTitle">Pay with Venmo</h2>
                    <div className="shopCheckout__payBody">
                        <figure className="shopCheckout__qr">
                            <img
                                src={venmoQrCode}
                                alt="Venmo QR code for IUGA UW, @iuga-uw"
                                width={1079}
                                height={1236}
                            />
                        </figure>
                        <div>
                            <p className="shopCheckout__payTo">
                                Pay <strong>@{VENMO_HANDLE}</strong> on Venmo
                            </p>
                            <ol className="shopCheckout__steps">
                                <li>Scan the code with the Venmo app, or search for @{VENMO_HANDLE}.</li>
                                <li>Send the exact amount shown above.</li>
                                <li>Add your Venmo username below, then confirm before your hold ends.</li>
                            </ol>
                        </div>
                    </div>
                </section>
            )}

            {isOpen && (
                <form onSubmit={handleConfirm} noValidate>
                    <div className="shopCheckout__fieldHeader">
                        <label htmlFor="shopCheckoutVenmo" className="shopCheckout__required">Venmo username</label>
                        <p className="shopCheckout__requiredNote" aria-hidden="true"><span>*</span> Required</p>
                    </div>
                    <input
                        id="shopCheckoutVenmo"
                        type="text"
                        autoComplete="off"
                        value={venmoUsername}
                        onChange={(event) => setVenmoUsername(event.target.value)}
                        onBlur={() => setTouched((previous) => ({ ...previous, username: true }))}
                        required
                        aria-invalid={usernameError || usernameMismatch ? "true" : undefined}
                        aria-describedby={usernameError || usernameMismatch ? "shopCheckoutVenmoError" : undefined}
                        disabled={isBusy}
                    />
                    {usernameMismatch && (
                        <>
                            <p id="shopCheckoutVenmoError" className="shopCheckout__fieldError" role="alert">
                                <span className="shopCheckout__errorIcon" aria-hidden="true">!</span>
                                This doesn’t match the Venmo username on your account.
                            </p>
                            <div>
                                <EmailContactDialog
                                    draft={usernameChangeEmailDraft(savedVenmoUsername, normalizeUsername(venmoUsername))}
                                    contextLabel="IUGA Shop"
                                    title="Email IUGA to change your Venmo username"
                                    triggerLabel="Email IUGA"
                                />
                            </div>
                        </>
                    )}
                    {usernameError && (
                        <p id="shopCheckoutVenmoError" className="shopCheckout__fieldError">
                            <span className="shopCheckout__errorIcon" aria-hidden="true">!</span>
                            {usernameError}
                        </p>
                    )}
                    <label htmlFor="shopCheckoutPhone" className="shopCheckout__required">Phone number</label>
                    <input
                        id="shopCheckoutPhone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        value={phoneNumber}
                        onChange={(event) => setPhoneNumber(event.target.value)}
                        onBlur={() => setTouched((previous) => ({ ...previous, phone: true }))}
                        placeholder="206-555-0123"
                        required
                        aria-invalid={phoneError ? "true" : undefined}
                        aria-describedby={phoneError ? "shopCheckoutPhoneError" : undefined}
                        disabled={isBusy}
                    />
                    {phoneError && (
                        <p id="shopCheckoutPhoneError" className="shopCheckout__fieldError">
                            <span className="shopCheckout__errorIcon" aria-hidden="true">!</span>
                            {phoneError}
                        </p>
                    )}
                    <div className="shopCheckout__actions">
                        <button
                            type="submit"
                            className="shopCheckout__button"
                            disabled={!canConfirm || isBusy}
                        >
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
