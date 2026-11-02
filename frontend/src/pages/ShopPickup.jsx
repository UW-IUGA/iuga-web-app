/*
Purpose: Officer Pickup page for handing shop orders over at the UW pickup table. The page opens on every order
         ready for pickup (paid, not yet handed over), grouped A to Z by last name or first name, with a letter rail
         to jump to a group. The search finds any order, including unconfirmed, dropped, refunded, and picked-up ones,
         with the reason it can or can't be handed over. Each card leads with the buyer's first and last name for the
         Husky Card check. Picked up records the handoff and shows a confirmation with Undo, which stays until the
         next pickup, Undo, or dismissal. The list refreshes from the
         server while the page is open, and a save is reported only when the server says it was saved.
Authentication/Authorization Requirements: Logged in. The server checks the shop.purchases.review permission
         on every request; without it the page shows no order details.
Expected Request Information: GET /api/v1/shop/purchases/pickup (the ready list and counts), GET
         /api/v1/shop/purchases (status=all, q) for search, GET /api/v1/shop/purchases/:id after a conflict, and
         PATCH /api/v1/shop/purchases/:id/pickup with { pickedUp, expectedRevision }.
Expected Response Information: An admin bar with the Orders and Pickup switch, a sticky search, a progress line,
         the ready list with its letter rail and sort switch (or the matching orders while searching), each order's
         pickup state, and one status line for confirmations and failures.
*/

import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { useAuthContext } from "../context/AuthContext";
import AdminBar from "../components/AdminBar";
import { formatDateTime } from "../utils/shopFormat";

const API = "/api/v1/shop/purchases";
const SEARCH_LABEL = "Search by name, email, or Venmo";
const SEARCH_DELAY_MS = 300;
const REFRESH_MS = 15000;
const SORT_STORAGE_KEY = "shopPickup.sortBy";
const SORTS = [
    { key: "last", label: "Last name" },
    { key: "first", label: "First name" },
];
const RAIL_LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];
const NOT_SAVED = "Not saved — check your connection and try again.";
const CHANGED_ELSEWHERE = "This order changed. Review its latest details before trying again.";
const NO_RESULT = { text: "", tone: "", undo: null, orderId: null, pinnedOrder: null, heldIds: null };
const EMPTY_SEARCH = { status: "idle", orders: [], nextCursor: null };

async function readJson(response) {
    return response.json().catch(() => null);
}

// The Husky Card name: the account's first and last name, or what is left of the account.
function fullName(buyer) {
    return [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ");
}

function orderTitle(order) {
    if (!order.buyer) return `@${order.venmoUsername}`;
    return fullName(order.buyer) || order.buyer.name || order.buyer.email;
}

// Reads the saved sort, and keeps the default when browser storage is blocked.
function readSortPreference() {
    try {
        return window.localStorage.getItem(SORT_STORAGE_KEY) === "first" ? "first" : "last";
    } catch {
        return "last";
    }
}

// The sort still applies for this visit when storage is blocked; it just isn't remembered.
function saveSortPreference(sortBy) {
    try {
        window.localStorage.setItem(SORT_STORAGE_KEY, sortBy);
    } catch {
        // Nothing else to do: the choice applies until the page closes.
    }
}

function plainText(text) {
    return String(text).normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// The words an order sorts under: last name then first name, or the reverse when sorting by first name.
function sortWords(order, sortBy) {
    const first = order.buyer?.firstName ?? "";
    const last = order.buyer?.lastName ?? "";
    return plainText(sortBy === "first" ? `${first} ${last}` : `${last} ${first}`);
}

// The letter heading an order sits under: the first letter of its sort name, or "#" for an account that is gone
// or a name that has no letter.
function letterOf(order, sortBy) {
    if (!order.buyer) return "#";
    const letter = sortWords(order, sortBy).charAt(0).toUpperCase();
    return /^[A-Z]$/.test(letter) ? letter : "#";
}

// Letters first, then "#". Within a letter, by name; "#" orders sort by Venmo username.
function compareOrders(a, b, sortBy) {
    const letterA = letterOf(a, sortBy);
    const letterB = letterOf(b, sortBy);
    if (letterA !== letterB) {
        if (letterA === "#") return 1;
        if (letterB === "#") return -1;
        return letterA.localeCompare(letterB);
    }
    const byName = letterA === "#" ? 0 : sortWords(a, sortBy).localeCompare(sortWords(b, sortBy), "en", { sensitivity: "base" });
    return byName
        || plainText(a.venmoUsername).localeCompare(plainText(b.venmoUsername), "en", { sensitivity: "base" })
        || a.id.localeCompare(b.id);
}

// The orders in the order the list shows them. A confirmation holds the order it was shown in, so the next tap lands
// where the officer expects: orders picked up by someone else drop out, and newly ready orders wait. The hold ends
// when the officer types, changes the sort, dismisses the confirmation, or marks another order. A pinned order (one
// an officer just tried to hand over) shows its latest copy in its place.
function listedOrders({ ready, pinned, heldIds, sortBy }) {
    const current = ready.map((order) => (pinned && order.id === pinned.id ? pinned : order));
    if (pinned && !current.some((order) => order.id === pinned.id)) current.push(pinned);
    if (!heldIds) return [...current].sort((a, b) => compareOrders(a, b, sortBy));
    const byId = new Map(current.map((order) => [order.id, order]));
    return heldIds.map((id) => byId.get(id)).filter(Boolean);
}

// Splits the listed orders into runs that share a letter, keeping the list's order.
function groupByLetter(orders, sortBy) {
    const groups = [];
    for (const order of orders) {
        const letter = letterOf(order, sortBy);
        const last = groups.at(-1);
        if (last && last.letter === letter) last.orders.push(order);
        else groups.push({ letter, orders: [order] });
    }
    return groups;
}

function anchorFor(letter) {
    return `shopPickup-letter-${letter === "#" ? "other" : letter}`;
}

function itemLine(line) {
    return `${line.quantity} × ${line.name} — ${line.size}`;
}

// The name the Husky Card should match, large, with the preferred name beneath when the student goes by another.
function NameLine({ order }) {
    if (!order.buyer) {
        return <span className="shopPickup__name">Account unavailable</span>;
    }
    const full = fullName(order.buyer) || order.buyer.name || order.buyer.email;
    const preferred = order.buyer.preferredName?.trim();
    const goesBy = preferred && preferred.toLowerCase() !== full.toLowerCase() ? preferred : null;
    return (
        <>
            <span className="shopPickup__name">{full}</span>
            {goesBy && <span className="shopPickup__preferred">{`goes by ${goesBy}`}</span>}
        </>
    );
}

// The handoff state of one order. Only a paid order gets the button; a picked-up order shows when and by whom,
// so a second handoff can't be started by mistake.
function PickupState({ order, saving, disabled, onPickUp }) {
    const pickedUpAt = order.pickup?.pickedUpAt;
    const pickedUpBy = order.pickup?.pickedUpBy;
    const blocked = order.status === "refunded"
        ? "Refunded — don't hand over"
        : order.status !== "paid" ? "Payment not confirmed — can't hand over yet" : null;
    return (
        <div className="shopPickup__state">
            {blocked && <p className="shopPickup__blocked">{blocked}</p>}
            {pickedUpAt && (
                <p className="shopPickup__pickedUp">
                    {`Picked up · ${formatDateTime(pickedUpAt)}${pickedUpBy ? ` by ${pickedUpBy}` : ""}`}
                </p>
            )}
            {order.status === "paid" && !pickedUpAt && (
                <>
                    <button
                        type="button"
                        className="shopAdmin__button shopAdmin__button--primary shopPickup__pickButton"
                        disabled={disabled}
                        onClick={onPickUp}
                    >
                        {saving ? "Saving…" : "Picked up"}
                    </button>
                </>
            )}
        </div>
    );
}

function OrderCard({ order, saving, disabled, onPickUp }) {
    return (
        <li className="shopPickup__card" aria-label={order.buyer ? fullName(order.buyer) || order.buyer.name : "Account unavailable"}>
            <div className="shopPickup__who">
                <NameLine order={order} />
                <span className="shopPickup__venmo">@{order.venmoUsername}</span>
                <span className="shopPickup__reference">Order {`...${order.id.slice(-4)}`}</span>
            </div>
            <ul className="shopPickup__items" aria-label="Items">
                {order.lines.map((line) => (
                    <li key={`${line.sku}-${line.size}`}>{itemLine(line)}</li>
                ))}
            </ul>
            <PickupState order={order} saving={saving} disabled={disabled} onPickUp={onPickUp} />
        </li>
    );
}

function LetterRail({ present, onJump }) {
    return (
        <nav className="shopPickup__rail" aria-label="Jump to a letter">
            {RAIL_LETTERS.map((letter) => (
                <button
                    key={letter}
                    type="button"
                    className="shopPickup__railLetter"
                    aria-label={`Jump to ${letter}`}
                    disabled={!present.has(letter)}
                    onClick={() => onJump(letter)}
                >
                    {letter}
                </button>
            ))}
        </nav>
    );
}

export default function ShopPickupPage() {
    const { isAuthenticated, authLoading, signIn } = useAuthContext();
    const searchRef = useRef(null);
    // One ready-list request runs at a time. A request asked for during another waits for it, and a list changed by
    // a handoff while a request ran is read again rather than shown stale.
    const boardSync = useRef({ busy: false, again: false, version: 0 });
    const [sortBy, setSortBy] = useState(readSortPreference);
    const [searchText, setSearchText] = useState("");
    const [query, setQuery] = useState("");
    const [accessDenied, setAccessDenied] = useState(null);
    const [board, setBoard] = useState(null);
    const [boardStatus, setBoardStatus] = useState("loading");
    const [boardStale, setBoardStale] = useState(false);
    const [search, setSearch] = useState(EMPTY_SEARCH);
    const [reloadKey, setReloadKey] = useState(0);
    // The order being saved (its id), or null. Only one handoff change is in flight at a time.
    const [savingId, setSavingId] = useState(null);
    const [result, setResult] = useState(NO_RESULT);

    // Search follows typing after a short pause, so each keystroke doesn't start a request.
    useEffect(() => {
        const timer = setTimeout(() => setQuery(searchText.trim()), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [searchText]);

    const refreshBoard = useCallback(async function refreshBoardNow() {
        const sync = boardSync.current;
        if (sync.busy) {
            sync.again = true;
            return;
        }
        sync.busy = true;
        const startedAt = sync.version;
        try {
            const response = await fetch(`${API}/pickup`);
            const body = await readJson(response);
            if (sync.version !== startedAt) {
                sync.again = true;
                return;
            }
            if (response.status === 401) return setAccessDenied("signedOut");
            if (response.status === 403) return setAccessDenied("forbidden");
            if (!response.ok || !body?.orders) throw new Error("pickup list unavailable");
            setAccessDenied(null);
            setBoard({ orders: body.orders, counts: body.counts, truncated: body.truncated, limit: body.limit });
            setBoardStatus("ready");
            setBoardStale(false);
        } catch {
            setBoardStatus((status) => (status === "ready" ? status : "error"));
            setBoardStale(true);
        } finally {
            sync.busy = false;
            if (sync.again) {
                sync.again = false;
                refreshBoardNow();
            }
        }
    }, []);

    // The list refreshes from the server every few seconds while the page is open, when the window regains focus,
    // and when the tab is shown again. Nothing refreshes while the tab is hidden.
    useEffect(() => {
        if (!isAuthenticated) return undefined;
        refreshBoard();
        const onVisible = () => {
            if (document.visibilityState !== "hidden") refreshBoard();
        };
        const timer = window.setInterval(onVisible, REFRESH_MS);
        window.addEventListener("focus", onVisible);
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener("focus", onVisible);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [isAuthenticated, refreshBoard]);

    // Finds orders across every payment status. An empty search asks for nothing; the ready list shows instead.
    useEffect(() => {
        if (!isAuthenticated || !query) {
            setSearch(EMPTY_SEARCH);
            return undefined;
        }
        const controller = new AbortController();
        setSearch({ status: "loading", orders: [], nextCursor: null });
        (async () => {
            try {
                const params = new URLSearchParams({ status: "all", q: query });
                const response = await fetch(`${API}?${params}`, { signal: controller.signal });
                const body = await readJson(response);
                if (response.status === 401) return setAccessDenied("signedOut");
                if (response.status === 403) return setAccessDenied("forbidden");
                if (!response.ok) return setSearch({ status: "error", orders: [], nextCursor: null });
                setAccessDenied(null);
                setSearch({ status: "ready", orders: body.purchases, nextCursor: body.nextCursor });
            } catch {
                if (!controller.signal.aborted) setSearch({ status: "error", orders: [], nextCursor: null });
            }
        })();
        return () => controller.abort();
    }, [isAuthenticated, query, reloadKey]);

    // Puts an order's latest copy into the ready list and any search results.
    const putBack = (order) => {
        setBoard((previous) => {
            if (!previous) return previous;
            const present = previous.orders.some((item) => item.id === order.id);
            const orders = present
                ? previous.orders.map((item) => (item.id === order.id ? order : item))
                : [...previous.orders, order];
            return { ...previous, orders };
        });
        setSearch((previous) => ({
            ...previous,
            orders: previous.orders.map((item) => (item.id === order.id ? order : item)),
        }));
    };

    // Sends one handoff change at the revision the officer saw. Returns the saved order, or a message and whether
    // trying again can help, plus the order as it is now after a conflict. A failed or lost save never counts as saved.
    const sendPickup = async (order, pickedUp) => {
        let response;
        let body;
        try {
            response = await fetch(`${API}/${order.id}/pickup`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pickedUp, expectedRevision: order.revision }),
            });
            body = await readJson(response);
        } catch {
            return { message: NOT_SAVED, retry: true };
        }
        if (response.ok) return { order: body.purchase };
        if (response.status === 409) {
            // Another officer acted first: show the order as it is now, with the server's reason.
            const current = await fetch(`${API}/${order.id}`).then(readJson).catch(() => null);
            return { message: body?.message || CHANGED_ELSEWHERE, retry: false, current: current?.purchase ?? null };
        }
        if (response.status >= 500) return { message: NOT_SAVED, retry: true };
        return { message: body?.message || NOT_SAVED, retry: false };
    };

    // shownIds is the ready list as the officer saw it when tapping, or null while searching.
    const pickUp = async (order, shownIds) => {
        setSavingId(order.id);
        const outcome = await sendPickup(order, true);
        setSavingId(null);
        if (outcome.order) {
            boardSync.current.version += 1;
            setBoard((previous) => previous && { ...previous, orders: previous.orders.filter((item) => item.id !== order.id) });
            setResult({
                ...NO_RESULT,
                text: `Picked up: ${orderTitle(outcome.order)}`,
                tone: "success",
                undo: { order: outcome.order },
                orderId: order.id,
                heldIds: shownIds,
            });
            if (query) {
                // Ready for the next student: the search clears and the search field takes focus.
                setSearchText("");
                setQuery("");
                searchRef.current?.focus();
            }
            refreshBoard();
            return;
        }
        setResult({
            ...NO_RESULT,
            text: outcome.message,
            tone: "warning",
            orderId: outcome.current ? order.id : null,
            pinnedOrder: outcome.current ?? null,
            heldIds: outcome.current ? shownIds : null,
        });
        refreshBoard();
    };

    const undoPickUp = async (order) => {
        setSavingId(order.id);
        const outcome = await sendPickup(order, false);
        setSavingId(null);
        if (!outcome.order) {
            setResult({ ...NO_RESULT, text: outcome.message, tone: "warning", undo: outcome.retry ? { order } : null });
            return;
        }
        boardSync.current.version += 1;
        putBack(outcome.order);
        setResult({ ...NO_RESULT, text: `Undid picked up: ${orderTitle(outcome.order)}` });
        refreshBoard();
    };

    const chooseSort = (key) => {
        setSortBy(key);
        saveSortPreference(key);
        // A new sort is a deliberate change: the list shows fresh orders, and the confirmation stays.
        setResult((previous) => ({ ...previous, heldIds: null }));
    };

    const jumpTo = (letter) => {
        document.getElementById(anchorFor(letter))?.scrollIntoView?.({ block: "start" });
    };

    if (authLoading) return null;

    const denied = isAuthenticated ? accessDenied : "signedOut";
    const searching = query !== "";
    const pinned = result.pinnedOrder;
    const readyOrders = board ? listedOrders({ ready: board.orders, pinned, heldIds: result.heldIds, sortBy }) : [];
    const readyIds = searching ? null : readyOrders.map((order) => order.id);
    const groups = groupByLetter(readyOrders, sortBy);
    const presentLetters = new Set(groups.map((group) => group.letter));
    const searchOrders = listedOrders({ ready: search.orders, pinned, heldIds: null, sortBy });
    const resultClass = result.text
        ? `shopAdmin__result${result.tone ? ` shopAdmin__result--${result.tone}` : ""}`
        : "shopAdmin__resultSlot";

    const renderCard = (order, shownIds) => (
        <OrderCard
            key={order.id}
            order={order}
            saving={savingId === order.id}
            disabled={savingId !== null}
            onPickUp={() => pickUp(order, shownIds)}
        />
    );

    return (
        <div className="shopAdmin shopPickup">
            <AdminBar />
            <main className="shopAdmin__main shopPickup__main">
                <div className="shopAdmin__heading">
                    <h1 className="shopAdmin__title">Pickup</h1>
                    <p className="shopAdmin__muted">Check each student's Husky Card name against the order, then tap Picked up. Search finds any order.</p>
                </div>

                {denied === "signedOut" && (
                    <section className="shopAdmin__panel">
                        <h2>Sign in to pick up orders</h2>
                        <p>This page is for IUGA officers who hand out shop orders.</p>
                        <button type="button" className="shopAdmin__button shopAdmin__button--primary" onClick={signIn}>
                            Sign in with UW NetID
                        </button>
                    </section>
                )}

                {denied === "forbidden" && (
                    <section className="shopAdmin__panel">
                        <h2>No access to pickup</h2>
                        <p>This page is for IUGA officers who hand out shop orders.</p>
                        <p>Ask an officer who manages roles to give you order review access.</p>
                    </section>
                )}

                {!denied && (
                    <>
                        <div className="shopPickup__stickyTop">
                            <form
                                className="shopPickup__search"
                                role="search"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    setQuery(searchText.trim());
                                }}
                            >
                                <label htmlFor="shopPickupSearch" className="sr-only">{SEARCH_LABEL}</label>
                                <div className="shopPickup__searchField">
                                    <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                                    <input
                                        id="shopPickupSearch"
                                        ref={searchRef}
                                        type="search"
                                        autoFocus
                                        maxLength={120}
                                        placeholder={SEARCH_LABEL}
                                        value={searchText}
                                        onChange={(event) => {
                                            setSearchText(event.target.value);
                                            // Typing starts a new lookup: the list shows fresh orders. A handoff's confirmation
                                            // and its Undo stay until the next pickup, Undo, or dismissal; other messages clear.
                                            setResult((previous) => (previous.undo ? { ...previous, heldIds: null } : NO_RESULT));
                                        }}
                                    />
                                </div>
                            </form>

                            <div className={resultClass}>
                                <span role="status" className={result.text ? "shopAdmin__resultText" : "sr-only"}>{result.text}</span>
                                {result.undo && (
                                    <div className="shopPickup__resultActions">
                                        <button
                                            type="button"
                                            className="shopAdmin__button shopPickup__undo"
                                            aria-label={`Undo picked up for ${orderTitle(result.undo.order)}`}
                                            disabled={savingId !== null}
                                            onClick={() => undoPickUp(result.undo.order)}
                                        >
                                            Undo
                                        </button>
                                        <button
                                            type="button"
                                            className="shopPickup__dismiss"
                                            aria-label="Dismiss confirmation"
                                            onClick={() => setResult(NO_RESULT)}
                                        >
                                            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {searching && (
                            <>
                                {search.status === "loading" && <p className="shopAdmin__muted">Searching…</p>}
                                {search.status === "error" && (
                                    <div className="shopAdmin__panel">
                                        <p>Couldn't load orders. Try again.</p>
                                        <button type="button" className="shopAdmin__button" onClick={() => setReloadKey((key) => key + 1)}>
                                            Try again
                                        </button>
                                    </div>
                                )}
                                {search.status === "ready" && searchOrders.length === 0 && (
                                    <p className="shopAdmin__panel">{`No orders match “${query}”.`}</p>
                                )}
                                {search.status === "ready" && searchOrders.length > 0 && (
                                    <ol className="shopPickup__results" aria-label="Matching orders">
                                        {searchOrders.map((order) => renderCard(order, null))}
                                    </ol>
                                )}
                                {search.status === "ready" && search.nextCursor && (
                                    <p className="shopAdmin__muted">More orders match. Add more of the name to narrow the list.</p>
                                )}
                            </>
                        )}

                        {!searching && (
                            <>
                                {!board && boardStatus === "loading" && <p className="shopAdmin__muted">Loading the pickup list…</p>}
                                {!board && boardStatus === "error" && (
                                    <div className="shopAdmin__panel">
                                        <p>Couldn't load the pickup list. Try again.</p>
                                        <button type="button" className="shopAdmin__button" onClick={() => refreshBoard()}>
                                            Try again
                                        </button>
                                    </div>
                                )}
                                {board && (
                                    <>
                                        <div className="shopPickup__bar">
                                            <p className="shopPickup__progress">
                                                {`${board.counts.ready.toLocaleString()} left to pick up · ${board.counts.pickedUp.toLocaleString()} picked up`}
                                            </p>
                                            <div className="shopPickup__sort" role="group" aria-label="Sort the list by">
                                                {SORTS.map((option) => (
                                                    <button
                                                        key={option.key}
                                                        type="button"
                                                        className={`shopPickup__sortButton${sortBy === option.key ? " shopPickup__sortButton--current" : ""}`}
                                                        aria-pressed={sortBy === option.key}
                                                        onClick={() => chooseSort(option.key)}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        {boardStale && <p className="shopAdmin__muted">Couldn't refresh the list just now. It will try again.</p>}
                                        {board.truncated && (
                                            <p className="shopAdmin__muted">{`Showing the first ${board.limit.toLocaleString()} orders. Search for anyone else.`}</p>
                                        )}
                                        {groups.length === 0 && (
                                            <p className="shopAdmin__panel">
                                                {board.counts.ready === 0
                                                    ? "No orders are waiting for pickup."
                                                    : "New orders appear when you search, change the sort, or dismiss the confirmation."}
                                            </p>
                                        )}
                                        {groups.length > 0 && (
                                            <div className="shopPickup__boardWrap">
                                                <section aria-label="Ready for pickup" className="shopPickup__groups">
                                                    {groups.map((group) => (
                                                        <section key={group.letter} id={anchorFor(group.letter)} className="shopPickup__group">
                                                            <h2 className="shopPickup__letter">{group.letter}</h2>
                                                            <ol className="shopPickup__results">
                                                                {group.orders.map((order) => renderCard(order, readyIds))}
                                                            </ol>
                                                        </section>
                                                    ))}
                                                </section>
                                                <LetterRail present={presentLetters} onJump={jumpTo} />
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
