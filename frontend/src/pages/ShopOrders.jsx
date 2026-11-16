/*
Purpose: Officer Orders page, a payments dashboard for the Director of Finance and other board members who
         check IUGA's Venmo. An overview shows what pending orders still owe; an amount-first table lists
         orders to match against Venmo; a drawer shows one order's balance, items, contact, and activity.
         Every change is confirmed in a small dialog first.
Authentication/Authorization Requirements: Logged in. The server checks the shop.purchases.review permission
  on every request; without it the page shows no order details.
Expected Request Information: Calls GET /api/v1/shop/purchases (status, followUp, balance, pickup, q, cursor),
  GET /api/v1/shop/purchases/counts, GET /api/v1/shop/purchases/:id, and PATCH
  /api/v1/shop/purchases/:id/payment, /amount-received, and /follow-up.
Expected Response Information: An admin bar instead of the site navbar, the overview, filters, the order
  table, the drawer, confirmations, announcements, and clear notices for sign-in, access, empty, conflict,
  and failure states. Orders stay in memory only.
*/

import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import AdminBar from "../components/AdminBar";
import { AmountForm, FollowUpForm, Modal, ModalButtons, ReasonConfirm, StatusChangeForm } from "../components/shopOrders/OrderDialogs";
import { OrderDrawer } from "../components/shopOrders/OrderDrawer";
import { OrderRow, Overview, TABLE_COLUMNS } from "../components/shopOrders/OrderList";
import { PickupWarning } from "../components/shopOrders/OrderTags";
import { useAuthContext } from "../context/AuthContext";
import { useLockPageScroll } from "../hooks/useLockPageScroll";
import { formatCents } from "../utils/shopFormat";
import { buyerLabel, canMarkPaid, FILTERS, itemSummary, matchesFilter } from "../utils/shopOrders/orderRules";
import { emptyMessage, markPaidNote, plural } from "../utils/shopOrders/orderText";

const API = "/api/v1/shop/purchases";

const RESULT_TEXT = { pending: "Moved back to unconfirmed", paid: "Marked paid", not_paid: "Dropped", refunded: "Refund recorded" };

const LOST_RESPONSE_MESSAGE = "We couldn't confirm that change. Review the latest details before trying again.";

const GENERIC_FAILURE = "Couldn't save. Nothing changed. Try again.";

const INITIAL_FILTERS = { filter: "pending", q: "" };

const SEARCH_DELAY_MS = 300;

const NO_RESULT = { text: "", tone: "", undo: null, retryIds: [] };

function listUrl({ filter, q }, cursor) {
    const { status, followUp = "all", balance, pickup } = FILTERS.find((item) => item.value === filter).query;
    const params = new URLSearchParams({ status, followUp });
    if (balance) params.set("balance", balance);
    if (pickup) params.set("pickup", pickup);
    if (q) params.set("q", q);
    if (cursor) params.set("cursor", cursor);
    return `${API}?${params}`;
}

function toItems(purchases) {
    return purchases.map((order) => ({ id: order.id, order }));
}

async function readJson(response) {
    return response.json().catch(() => null);
}

export default function ShopOrdersPage() {
    const { isAuthenticated, authLoading, user, signIn } = useAuthContext();
    const [filters, setFilters] = useState(INITIAL_FILTERS);
    const [searchText, setSearchText] = useState("");
    const [view, setView] = useState("loading");
    const [items, setItems] = useState([]);
    const [nextCursor, setNextCursor] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [result, setResult] = useState(NO_RESULT);
    const announcement = result.text;
    // Each result replaces the last, so an older Undo or retry offer goes with it.
    const setAnnouncement = useCallback((text, offers = {}) => setResult({ ...NO_RESULT, text, ...offers }), []);
    // A failure is shown in the warning style; the text itself is the same single status line either way.
    const resultClass = announcement
        ? `shopAdmin__result${result.tone === "warning" ? " shopAdmin__result--warning" : ""}`
        : "shopAdmin__resultSlot";
    const [reloadKey, setReloadKey] = useState(0);
    const [summary, setSummary] = useState(null);
    const [countsKey, setCountsKey] = useState(0);
    const [checkedIds, setCheckedIds] = useState(() => new Set());
    const [openId, setOpenId] = useState(null);
    const [detail, setDetail] = useState(null);
    // The confirmation on screen: { kind, itemId, returnFocusTo }, or null.
    const [modal, setModal] = useState(null);
    // { current, total } while selected orders are being marked paid one by one; null otherwise.
    const [bulkProgress, setBulkProgress] = useState(null);
    const bulkSaving = bulkProgress !== null;
    const bulkSaveInProgress = useRef(false);
    const generation = useRef(0);
    // First pages already seen, by request URL. Emptied after any saved change, so nothing outdated shows.
    const recentPages = useRef(new Map());
    const tabRefs = useRef({});
    const buyerButtons = useRef({});
    const focusBuyerOf = useRef(null);

    // A different account never sees the previous account's orders, even briefly.
    useEffect(() => {
        recentPages.current.clear();
        setItems([]);
        setNextCursor(null);
    }, [isAuthenticated, user]);

    /*
     * @behavior Loads the first page for the current filter and search. The orders on screen stay until the
     *           answer arrives, so switching filters or typing doesn't blank the table; a first page seen
     *           moments ago shows at once and refreshes quietly. A request still in flight is cancelled when
     *           a newer one replaces it, and any late answer is ignored.
     */
    useEffect(() => {
        const current = ++generation.current;
        setLoadingMore(false);
        setNextCursor(null);
        setAnnouncement("");
        setCheckedIds(new Set());
        setModal(null);
        setOpenId(null);
        setDetail(null);
        if (!isAuthenticated) {
            setView("signedOut");
            return undefined;
        }
        const url = listUrl(filters);
        const showPage = (page) => {
            setItems(toItems(page.purchases));
            setNextCursor(page.nextCursor);
            setView("ready");
        };
        const remembered = recentPages.current.get(url);
        if (remembered) showPage(remembered);
        else setView((previous) => (previous === "ready" ? "ready" : "loading"));
        setRefreshing(true);

        const controller = new AbortController();
        let finished = false;
        (async () => {
            try {
                const response = await fetch(url, { signal: controller.signal });
                const body = await readJson(response);
                if (current !== generation.current) return;
                if (response.status === 401) return setView("signedOut");
                if (response.status === 403) return setView("forbidden");
                if (!response.ok) return setView("error");
                const page = { purchases: body.purchases, nextCursor: body.nextCursor };
                recentPages.current.set(url, page);
                showPage(page);
            } catch {
                if (current === generation.current && !controller.signal.aborted) setView("error");
            } finally {
                finished = true;
                if (current === generation.current) setRefreshing(false);
            }
        })();
        return () => {
            if (!finished) controller.abort();
        };
    }, [isAuthenticated, user, filters, reloadKey]);

    // A different account, or signing out, never sees the previous account's numbers.
    useEffect(() => {
        setSummary(null);
    }, [isAuthenticated, user]);

    // Counts and totals are a convenience: when they can't load, filters show labels only and the overview hides.
    // A refresh after a saved change keeps the numbers on screen, since they were true a moment ago; if that
    // refresh fails, the last numbers stay. On a first load that fails there are none, so the overview stays hidden.
    useEffect(() => {
        let active = true;
        if (!isAuthenticated) return undefined;
        (async () => {
            try {
                const response = await fetch(`${API}/counts`);
                const body = await readJson(response);
                if (active && response.ok) setSummary({ counts: body.counts, totals: body.totals });
            } catch {
                // Keeps the last numbers, as described above.
            }
        })();
        return () => {
            active = false;
        };
    }, [isAuthenticated, user, countsKey]);

    // The drawer reads the order again for the buyer's phone number, which the list leaves out.
    useEffect(() => {
        if (!openId) return undefined;
        let active = true;
        setDetail({ id: openId, order: null, status: "loading" });
        (async () => {
            try {
                const response = await fetch(`${API}/${openId}`);
                const body = await readJson(response);
                if (!active) return;
                setDetail(response.ok ? { id: openId, order: body.purchase, status: "ready" } : { id: openId, order: null, status: "error" });
            } catch {
                if (active) setDetail({ id: openId, order: null, status: "error" });
            }
        })();
        return () => {
            active = false;
        };
    }, [openId]);

    // Search follows typing after a short pause, so each keystroke doesn't start a request.
    useEffect(() => {
        const q = searchText.trim();
        const timer = setTimeout(() => {
            setFilters((previous) => (previous.q === q ? previous : { ...previous, q }));
        }, SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [searchText]);

    useEffect(() => {
        if (openId === null && focusBuyerOf.current) {
            buyerButtons.current[focusBuyerOf.current]?.focus();
            focusBuyerOf.current = null;
        }
    }, [openId]);

    const loadMore = async () => {
        const current = generation.current;
        setLoadingMore(true);
        try {
            const response = await fetch(listUrl(filters, nextCursor));
            const body = await readJson(response);
            if (current !== generation.current) return;
            if (!response.ok) {
                setAnnouncement(body?.message || "Couldn't load more orders. Try again.");
                return;
            }
            setItems((previous) => [...previous, ...toItems(body.purchases)]);
            setNextCursor(body.nextCursor);
        } catch {
            if (current === generation.current) setAnnouncement("Couldn't load more orders. Try again.");
        } finally {
            if (current === generation.current) setLoadingMore(false);
        }
    };

    const updateItem = useCallback((id, change) => {
        setItems((previous) => previous.map((item) => (item.id === id ? { ...item, ...change } : item)));
    }, []);

    // Single-order responses carry the phone number, so they also refresh an open drawer.
    const showSavedOrder = useCallback((order) => {
        setDetail((previous) => (previous?.id === order.id ? { id: order.id, order, status: "ready" } : previous));
    }, []);

    // Shows the order's latest saved state with a notice, for a fresh review after a conflict or lost response.
    const refreshOrder = useCallback(async (id, notice, current) => {
        updateItem(id, { notice, saving: false });
        try {
            const response = await fetch(`${API}/${id}`);
            const body = await readJson(response);
            if (current === generation.current && response.ok) {
                updateItem(id, { order: body.purchase });
                showSavedOrder(body.purchase);
            }
        } catch {
            // The notice already asks the officer to review before trying again.
        }
    }, [showSavedOrder, updateItem]);

    /*
     * @behavior Sends one decision for one order and updates it from the server's answer. Nothing is retried.
     *           The server's answer stands even if the officer changed the filter meanwhile: a saved decision is
     *           reported as saved, and updates are matched by order id, so a list that no longer shows the order
     *           is left alone.
     * @returns { order } when saved, or { message } when it was not
     */
    const sendDecision = useCallback(async (item, path, payload, method = "PATCH") => {
        const current = generation.current;
        updateItem(item.id, { saving: true, notice: null });
        let response;
        let body;
        try {
            response = await fetch(`${API}/${item.id}/${path}`, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...payload, expectedRevision: item.order.revision }),
            });
            body = await readJson(response);
        } catch {
            if (current === generation.current) refreshOrder(item.id, LOST_RESPONSE_MESSAGE, current);
            return { message: LOST_RESPONSE_MESSAGE };
        }
        if (!response.ok) {
            const message = body?.message || GENERIC_FAILURE;
            if (response.status === 409) refreshOrder(item.id, message, current);
            else updateItem(item.id, { saving: false, notice: message });
            return { message };
        }
        const order = body.purchase;
        recentPages.current.clear();
        showSavedOrder(order);
        setCountsKey((key) => key + 1);
        return { order };
    }, [refreshOrder, showSavedOrder, updateItem]);

    // Keeps a changed order in the table while it still matches the filter; otherwise leaves a result line.
    const placeSavedOrder = useCallback((id, order, resultText) => {
        updateItem(id, matchesFilter(order, filters.filter)
            ? { order, saving: false, notice: null }
            : { order: null, result: resultText, saving: false, notice: null });
    }, [filters, updateItem]);

    const decide = useCallback(async (item, path, payload, describe, method, undoable = false) => {
        setAnnouncement("");
        const { order } = await sendDecision(item, path, payload, method);
        if (!order) return;
        const text = describe(order);
        setAnnouncement(text, undoable ? { undo: { item: { id: item.id, order } } } : {});
        placeSavedOrder(item.id, order, text);
    }, [placeSavedOrder, sendDecision, setAnnouncement]);

    const paidText = (order) => `Marked paid: ${buyerLabel(order)}, ${formatCents(order.totalCents)}`;

    const setPayment = (item, status, note = "") => decide(
        item,
        "payment",
        { status, ...(note && { note }) },
        (order) => `${RESULT_TEXT[status]}: ${buyerLabel(order)}, ${formatCents(order.totalCents)}`,
    );

    // Unconfirmed and Paid hold the same stock, so Undo of a mark paid needs no confirmation. Only an order that was
    // unconfirmed gets it; a dropped order would take its items again.
    // An order that was picked up needs a reason to move back to Unconfirmed, which Undo does not ask for.
    const markPaid = (item) => decide(
        item,
        "payment",
        { status: "paid" },
        paidText,
        undefined,
        item.order.status === "pending" && !item.order.pickup.pickedUpAt,
    );

    // Moves a just-marked order back to Unconfirmed, at the revision the mark-paid answer saved.
    const undoMarkPaid = async (item) => {
        setAnnouncement("");
        const { order, message } = await sendDecision(item, "payment", { status: "pending" });
        if (!order) {
            setAnnouncement(message, { tone: "warning" });
            return;
        }
        const text = `${RESULT_TEXT.pending}: ${buyerLabel(order)}, ${formatCents(order.totalCents)}`;
        setAnnouncement(text);
        placeSavedOrder(item.id, order, text);
    };

    const setAmount = (item, amountReceivedCents) => decide(
        item,
        "amount-received",
        { amountReceivedCents },
        (order) => (order.status === "paid" ? paidText(order) : `Recorded ${formatCents(order.amountReceivedCents)} received: ${buyerLabel(order)}`),
    );

    const setFollowUp = (item, followUpStatus, note = "") => decide(
        item,
        "follow-up",
        { followUpStatus, ...(note && { note }) },
        (order) => `${followUpStatus === "none" ? "Cleared follow-up" : "Logged follow-up"}: ${buyerLabel(order)}`,
    );

    const addNote = (item, title, note) => decide(
        item,
        "notes",
        { title, ...(note && { note }) },
        (order) => `Added to log: ${buyerLabel(order)}`,
        "POST",
    );

    const openModal = (kind, item, returnFocusTo) => setModal({ kind, itemId: item?.id ?? null, returnFocusTo });

    const closeModal = () => {
        const target = modal?.returnFocusTo;
        setModal(null);
        if (target?.isConnected) target.focus();
    };

    // The drawer's "···" holds only rare actions; its amount and log controls sit by the figures they change.
    // Change status is here too, where officers look first, as well as on the status badge.
    const rareActionsFor = (item) => [
        { label: "Change status…", onSelect: (from) => openModal("status", item, from) },
        item.order.status === "pending" && { label: "Drop unconfirmed order", danger: true, onSelect: (from) => openModal("drop", item, from) },
        item.order.status === "paid" && { label: "Record refund", danger: true, onSelect: (from) => openModal("refund", item, from) },
    ].filter(Boolean);

    // A row's "···" also offers entering the amount, so a partial payment can be recorded without the drawer.
    const rowActionsFor = (item) => [
        canMarkPaid(item.order) && { label: "Enter amount received", onSelect: (from) => openModal("amount", item, from) },
        ...rareActionsFor(item),
    ].filter(Boolean);

    // Only orders that can still be marked paid count as selected, so an order whose status changed after
    // it was checked (by this officer or another) is never sent with the others.
    const checkedItems = items.filter((item) => item.order && canMarkPaid(item.order) && checkedIds.has(item.id));
    const checkedTotal = checkedItems.reduce((sum, item) => sum + item.order.totalCents, 0);
    // Failed orders that can still be marked paid, which is what "Select the N that failed" selects again.
    const retryItems = items.filter((item) => item.order && canMarkPaid(item.order) && result.retryIds.includes(item.id));

    // Marks each selected order paid with its own request and revision, then reports any that failed by name.
    const markCheckedPaid = async () => {
        if (bulkSaveInProgress.current) return;
        bulkSaveInProgress.current = true;
        setAnnouncement("");
        const chosen = checkedItems;
        const failures = [];
        const failedIds = [];
        try {
            for (const [index, item] of chosen.entries()) {
                setBulkProgress({ current: index + 1, total: chosen.length });
                const { order, message } = await sendDecision(item, "payment", { status: "paid" });
                if (order) {
                    placeSavedOrder(item.id, order, paidText(order));
                } else {
                    failures.push(`Couldn't mark ${buyerLabel(item.order)}'s order: ${message}`);
                    failedIds.push(item.id);
                }
            }
            setCheckedIds(new Set());
            const marked = chosen.length - failures.length;
            setAnnouncement(failures.length === 0
                ? `Marked ${marked} ${marked === 1 ? "order" : "orders"} paid.`
                : `Marked ${marked} of ${chosen.length} orders paid. ${failures.join(" ")}`,
            failures.length === 0 ? {} : { retryIds: failedIds, tone: "warning" });
        } finally {
            bulkSaveInProgress.current = false;
            setBulkProgress(null);
        }
    };

    const setChecked = (id, checked) => {
        setCheckedIds((previous) => {
            const next = new Set(previous);
            if (checked) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const closeDetails = () => {
        focusBuyerOf.current = openId;
        setOpenId(null);
        setDetail(null);
    };

    const chooseFilter = (filter) => setFilters((previous) => ({ ...previous, filter }));

    const onTabKeyDown = (event, index) => {
        const offsets = { ArrowRight: 1, ArrowLeft: -1 };
        let nextIndex = null;
        if (event.key in offsets) nextIndex = (index + offsets[event.key] + FILTERS.length) % FILTERS.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = FILTERS.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        const next = FILTERS[nextIndex].value;
        chooseFilter(next);
        tabRefs.current[next]?.focus();
    };

    useLockPageScroll(openId !== null || modal !== null);

    if (authLoading) return null;

    const showOrders = view !== "signedOut" && view !== "forbidden";
    const openItem = items.find((item) => item.id === openId && item.order);
    const detailOrder = (detail?.id === openId && detail.order) || openItem?.order || null;
    const contact = {
        status: detail?.status ?? "loading",
        phone: detail?.order?.buyer?.phone ?? null,
    };
    const checkedCount = checkedItems.length;
    const modalItem = modal?.itemId ? items.find((item) => item.id === modal.itemId && item.order) : null;
    const listedCount = items.filter((item) => item.order).length;

    const modalContent = () => {
        if (modal?.kind === "bulk") {
            return {
                title: `Mark ${plural(checkedCount, "order", "orders")} paid?`,
                body: (close) => (
                    <>
                        <p>{formatCents(checkedTotal)} in total. Only do this after finding every payment in IUGA's Venmo.</p>
                        <ModalButtons close={close} confirmLabel={`Mark ${checkedCount} paid`} onConfirm={markCheckedPaid} />
                    </>
                ),
            };
        }
        if (!modalItem) return null;
        const { order } = modalItem;
        const amount = formatCents(order.totalCents);
        const whose = order.buyer?.name ? `${order.buyer.name}'s` : "this";
        if (modal.kind === "paid") {
            return {
                title: `Mark ${amount} as paid?`,
                body: (close) => (
                    <>
                        <p>{markPaidNote(order)}</p>
                        <ModalButtons close={close} confirmLabel="Mark paid" onConfirm={() => markPaid(modalItem)} />
                    </>
                ),
            };
        }
        if (modal.kind === "amount") {
            return {
                title: "Amount received",
                body: (close) => <AmountForm order={order} close={close} onSave={(cents) => setAmount(modalItem, cents)} />,
            };
        }
        if (modal.kind === "followUp") {
            return {
                title: `Log follow-up for ${buyerLabel(order)}`,
                body: (close) => (
                    <FollowUpForm
                        order={order}
                        close={close}
                        onSave={(choice, note, topic) => (choice === "other" ? addNote(modalItem, topic, note) : setFollowUp(modalItem, choice, note))}
                    />
                ),
            };
        }
        if (modal.kind === "status") {
            return {
                title: `Change status of ${whose} order`,
                body: (close) => (
                    <StatusChangeForm order={order} close={close} onConfirm={(to, reason) => setPayment(modalItem, to, reason)} />
                ),
            };
        }
        const pickedUp = Boolean(order.pickup.pickedUpAt);
        if (modal.kind === "drop") {
            return {
                title: `Drop ${whose} ${amount} order?`,
                body: (close) => (
                    <>
                        {pickedUp && <PickupWarning order={order} />}
                        <p>Use this only if no matching Venmo payment came.</p>
                        <p>Returns to stock: {itemSummary(order)}.</p>
                        <p>The student's purchase allowance is restored. This does not refund a Venmo payment.</p>
                        <p>If this was a mistake, change its status from the order; taking the items again works only if they still fit.</p>
                        {pickedUp ? (
                            <ReasonConfirm close={close} danger confirmLabel="Drop unconfirmed order" onConfirm={(reason) => setPayment(modalItem, "not_paid", reason)} />
                        ) : (
                            <ModalButtons close={close} danger confirmLabel="Drop unconfirmed order" onConfirm={() => setPayment(modalItem, "not_paid")} />
                        )}
                    </>
                ),
            };
        }
        return {
            title: `Record refund for ${whose} ${amount} order?`,
            body: (close) => (
                <>
                    {pickedUp && <PickupWarning order={order} />}
                    <p>Send the refund in Venmo first; this site does not move money.</p>
                    <p>Items return to stock and the student's allowance is restored. If this was a mistake, change its status from the order.</p>
                    {pickedUp ? (
                        <ReasonConfirm close={close} danger confirmLabel="Record refund" onConfirm={(reason) => setPayment(modalItem, "refunded", reason)} />
                    ) : (
                        <ModalButtons close={close} danger confirmLabel="Record refund" onConfirm={() => setPayment(modalItem, "refunded")} />
                    )}
                </>
            ),
        };
    };
    const shownModal = modal ? modalContent() : null;

    return (
        <div className="shopAdmin">
            <AdminBar />
            <main className="shopAdmin__main">
                <div className="shopAdmin__heading">
                    <h1 className="shopAdmin__title">Orders</h1>
                    <p className="shopAdmin__muted">Match each order to a payment in IUGA's Venmo. Oldest first.</p>
                </div>

                {view === "signedOut" && (
                    <section className="shopAdmin__panel">
                        <h2>Sign in to review orders</h2>
                        <p>This page is for IUGA officers who review shop orders.</p>
                        <button type="button" className="shopAdmin__button shopAdmin__button--primary" onClick={signIn}>
                            Sign in with UW NetID
                        </button>
                    </section>
                )}

                {view === "forbidden" && (
                    <section className="shopAdmin__panel">
                        <h2>No access to orders</h2>
                        <p>This page is for IUGA officers who review shop orders.</p>
                        <p>Ask an officer who manages roles to give you order review access.</p>
                    </section>
                )}

                {showOrders && (
                    <>
                        {summary?.totals && <Overview counts={summary.counts} totals={summary.totals} onChooseFilter={chooseFilter} />}

                        <div className="shopAdmin__toolbar">
                        <div role="tablist" aria-label="Filter orders" className="shopAdmin__filters">
                            {FILTERS.map((tab, index) => {
                                const selected = filters.filter === tab.value;
                                return (
                                    <button
                                        key={tab.value}
                                        type="button"
                                        role="tab"
                                        id={`shopOrdersTab-${tab.value}`}
                                        aria-selected={selected}
                                        aria-controls="shopOrdersList"
                                        tabIndex={selected ? 0 : -1}
                                        ref={(node) => { tabRefs.current[tab.value] = node; }}
                                        className="shopAdmin__filter"
                                        onClick={() => chooseFilter(tab.value)}
                                        onKeyDown={(event) => onTabKeyDown(event, index)}
                                    >
                                        {tab.label}
                                        {summary && (
                                            <>
                                                {" "}
                                                <span className={tab.value === "awaiting" && summary.counts.awaiting > 0 ? "shopAdmin__filterCount shopAdmin__filterCount--waiting" : "shopAdmin__filterCount"}>
                                                    {summary.counts[tab.value]}
                                                </span>
                                            </>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <form
                            className="shopAdmin__search"
                            role="search"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setFilters((previous) => ({ ...previous, q: searchText.trim() }));
                            }}
                        >
                            <label htmlFor="shopOrdersSearch" className="sr-only">Search by Venmo, name, or email</label>
                            <div className="shopAdmin__searchField">
                                <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                                <input
                                    id="shopOrdersSearch"
                                    type="search"
                                    maxLength={120}
                                    placeholder="Search by Venmo, name, or email"
                                    value={searchText}
                                    onChange={(event) => setSearchText(event.target.value)}
                                />
                            </div>
                        </form>
                        </div>

                        <div className={resultClass}>
                            <span role="status" className={announcement ? "shopAdmin__resultText" : "sr-only"}>{announcement}</span>
                            {result.undo && (
                                <button
                                    type="button"
                                    className="shopAdmin__button"
                                    aria-label={`Undo mark paid for ${buyerLabel(result.undo.item.order)}`}
                                    onClick={() => undoMarkPaid(result.undo.item)}
                                >
                                    Undo
                                </button>
                            )}
                            {retryItems.length > 0 && (
                                <button type="button" className="shopAdmin__button" onClick={() => setCheckedIds(new Set(retryItems.map((item) => item.id)))}>
                                    {`Select the ${retryItems.length} that failed`}
                                </button>
                            )}
                        </div>

                        <section
                            id="shopOrdersList"
                            role="tabpanel"
                            aria-labelledby={`shopOrdersTab-${filters.filter}`}
                            aria-busy={refreshing}
                            className={refreshing ? "shopAdmin__list shopAdmin__list--refreshing" : "shopAdmin__list"}
                        >
                            {(view === "loading" || (view === "ready" && refreshing && items.length === 0)) && (
                                <p className="shopAdmin__panel">Loading orders…</p>
                            )}
                            {view === "error" && (
                                <div className="shopAdmin__panel">
                                    <p>Couldn't load orders. No changes were made.</p>
                                    <button type="button" className="shopAdmin__button" onClick={() => setReloadKey((key) => key + 1)}>
                                        Try again
                                    </button>
                                </div>
                            )}
                            {view === "ready" && !refreshing && items.length === 0 && (
                                <div className="shopAdmin__panel">
                                    <p>{emptyMessage(filters)}</p>
                                    {filters.q && filters.filter !== "all" && (
                                        <button type="button" className="shopAdmin__button" onClick={() => chooseFilter("all")}>
                                            Search all orders
                                        </button>
                                    )}
                                </div>
                            )}
                            {view === "ready" && items.length > 0 && (
                                <div className="shopAdmin__tableWrap">
                                    <table className="shopAdmin__table">
                                        <caption className="sr-only">Orders</caption>
                                        <thead>
                                            <tr>
                                                <th scope="col" className="shopAdmin__select"><span className="sr-only">Select</span></th>
                                                <th scope="col">Amount</th>
                                                <th scope="col">Venmo</th>
                                                <th scope="col">Customer</th>
                                                <th scope="col">Items</th>
                                                <th scope="col">Date</th>
                                                <th scope="col"><span className="sr-only">Actions</span></th>
                                            </tr>
                                        </thead>
                                        {items.map((item) => (item.order ? (
                                            <OrderRow
                                                key={item.id}
                                                item={item}
                                                checked={checkedIds.has(item.id)}
                                                open={item.id === openId}
                                                actions={rowActionsFor(item)}
                                                onCheck={(checked) => setChecked(item.id, checked)}
                                                onOpen={() => setOpenId(item.id)}
                                                onMarkPaid={(from) => openModal("paid", item, from)}
                                                buyerButtonRef={(node) => { buyerButtons.current[item.id] = node; }}
                                            />
                                        ) : (
                                            <tbody key={item.id} className="shopAdmin__order">
                                                <tr className="shopAdmin__resultRow">
                                                    <td colSpan={TABLE_COLUMNS}>{item.result}</td>
                                                </tr>
                                            </tbody>
                                        )))}
                                    </table>
                                </div>
                            )}
                            {view === "ready" && items.length > 0 && (
                                <div className="shopAdmin__listFooter">
                                    <span className="shopAdmin__muted">{plural(listedCount, "order", "orders")}, oldest first</span>
                                    {nextCursor && (
                                        <button type="button" className="shopAdmin__button" disabled={loadingMore} onClick={loadMore}>
                                            {loadingMore ? "Loading…" : "Load more orders"}
                                        </button>
                                    )}
                                </div>
                            )}
                        </section>

                        {(checkedCount > 0 || bulkSaving) && (
                            <div className="shopAdmin__selectionBar" role="region" aria-label="Selected orders">
                                <span className="shopAdmin__selectionCount">
                                    {bulkSaving ? `Marking ${bulkProgress.current} of ${bulkProgress.total}…` : `${checkedCount} selected`}
                                </span>
                                {!bulkSaving && <span className="shopAdmin__selectionTotal">{formatCents(checkedTotal)} total</span>}
                                <div className="shopAdmin__selectionButtons">
                                    <button type="button" className="shopAdmin__button" disabled={bulkSaving} onClick={() => setCheckedIds(new Set())}>Clear</button>
                                    <button
                                        type="button"
                                        className="shopAdmin__button shopAdmin__button--primary"
                                        disabled={bulkSaving}
                                        onClick={(event) => openModal("bulk", null, event.currentTarget)}
                                    >
                                        {bulkSaving ? "Saving…" : `Mark ${checkedCount} paid`}
                                    </button>
                                </div>
                            </div>
                        )}

                        <OrderDrawer
                            order={detailOrder}
                            item={openItem}
                            contact={contact}
                            actions={openItem ? rareActionsFor(openItem) : []}
                            onMarkPaid={(from) => openItem && openModal("paid", openItem, from)}
                            onEnterAmount={(from) => openItem && openModal("amount", openItem, from)}
                            onAddToLog={(from) => openItem && openModal("followUp", openItem, from)}
                            onFollowUp={(followUpStatus) => openItem && setFollowUp(openItem, followUpStatus)}
                            onChangeStatus={(from) => openItem && openModal("status", openItem, from)}
                            onClose={closeDetails}
                        />
                    </>
                )}

                <Modal open={Boolean(shownModal)} title={shownModal?.title} onClose={closeModal}>
                    {(close) => shownModal.body(close)}
                </Modal>
            </main>
        </div>
    );
}
