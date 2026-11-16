/*
 * Purpose: What the officer Orders page knows about an order: its status and follow-up labels, the filter
 *          tabs and the server query behind each, and the rules for which orders can be marked paid, are
 *          short, or hold stock. The rules mirror the server's review filters
 *          (backend/routes/api/v1/utils/shopPurchaseReview.js); keep the two in step.
 * Expected Request Information: An order as the review API returns it.
 * Expected Response Information: Labels, booleans, and summaries; no browser or network access.
 */

// Each filter is one server query. Balance remaining and Follow-up look across every payment status.
// Paid orders are split by pickup, so Ready for pickup holds only orders still to hand over and Picked up
// keeps finished ones out of the way without hiding them from search or All.
// Labels describe each state as the Director of Finance sees it in Venmo; server values stay as stored. Pending reads
// as Unconfirmed: the student may have paid, but no officer has found the payment yet.
export const FILTERS = [
    { value: "pending", label: "Unconfirmed", query: { status: "pending" } },
    { value: "short", label: "Balance remaining", query: { status: "all", balance: "short" } },
    { value: "awaiting", label: "Follow-up", query: { status: "all", followUp: "awaiting" } },
    { value: "ready", label: "Ready for pickup", query: { status: "paid", pickup: "ready" } },
    { value: "picked_up", label: "Picked up", query: { status: "paid", pickup: "picked_up" } },
    { value: "not_paid", label: "Dropped", query: { status: "not_paid" } },
    { value: "refunded", label: "Refunded", query: { status: "refunded" } },
    { value: "all", label: "All", query: { status: "all" } },
];

export const FILTER_LABELS = Object.fromEntries(FILTERS.map((filter) => [filter.value, filter.label]));

export const STATUS_LABELS = { pending: "Unconfirmed", paid: "Paid", not_paid: "Dropped", refunded: "Refunded" };

// Where follow-up with the student stands. It never changes payment status.
export const FOLLOW_UP_LABELS = { contacted: "Contacted", will_pay: "Will pay", says_paid: "Says paid" };

export const FOLLOW_UP_CHOICES = [
    { value: "contacted", label: "I contacted the student" },
    { value: "will_pay", label: "Student said they will pay" },
    { value: "says_paid", label: "Student says they already paid" },
];

export function orderReference(order) {
    return `...${order.id.slice(-4)}`;
}

export function buyerLabel(order) {
    return order.buyer?.name || order.buyer?.email || "Account unavailable";
}

export function canMarkPaid(order) {
    return order.status === "pending" || order.status === "not_paid";
}

// A picked-up order that is no longer Paid: the merch was handed over, and the change took it back.
export function changedAfterPickup(order) {
    return order.status !== "paid" && Boolean(order.pickup.pickedUpAt);
}

// Matches the server's short filter: an amount was recorded and it is below the total.
function isShort(order) {
    const received = order.amountReceivedCents;
    return canMarkPaid(order) && received != null && received < order.totalCents;
}

export function matchesFilter(order, filter) {
    if (filter === "all") return true;
    if (filter === "short") return isShort(order);
    if (filter === "awaiting") return Boolean(order.followUp.status);
    if (filter === "ready") return order.status === "paid" && !order.pickup.pickedUpAt;
    if (filter === "picked_up") return order.status === "paid" && Boolean(order.pickup.pickedUpAt);
    return order.status === filter;
}

// What was bought, by product and price. Sizes are left out: they don't change what is owed.
export function purchasedProducts(order) {
    const products = new Map();
    for (const line of order.lines) {
        const key = `${line.sku}-${line.unitPriceCents}`;
        const product = products.get(key) ?? { key, name: line.name, quantity: 0, unitPriceCents: line.unitPriceCents, totalCents: 0 };
        product.quantity += line.quantity;
        product.totalCents += line.lineTotalCents;
        products.set(key, product);
    }
    return [...products.values()];
}

export function itemSummary(order) {
    return purchasedProducts(order).map((product) => (product.quantity > 1 ? `${product.name} ×${product.quantity}` : product.name)).join(", ");
}

// Unconfirmed and Paid orders hold their items; Dropped and Refunded orders have returned them to stock.
export const HOLDS_STOCK = new Set(["pending", "paid"]);

// What a status change does to stock, shown in the status menu and its confirmation.
export function stockEffect(from, to) {
    if (HOLDS_STOCK.has(from) === HOLDS_STOCK.has(to)) return "no stock change";
    return HOLDS_STOCK.has(to) ? "takes items again" : "returns items";
}
