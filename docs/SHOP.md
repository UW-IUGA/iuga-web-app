# IUGA Website — Shop and Checkout

The shop sells IUGA merchandise online. This document explains the words the code uses, what one
checkout does from start to finish, and which file owns each step. Read it before changing
anything under `backend/shop/`, `backend/services/checkout-*`, or the shop routes.

## What exists today

| Piece | State |
|---|---|
| Shop page (`/shop`) | Live, advertising only — a name, a photo, and a description per product. No prices, sizes, cart, or buy buttons yet. |
| Checkout endpoint | Built and tested, but **switched off**. Until a deployment passes every readiness check, it answers `503` and nothing can be bought. |
| Catalog (prices, sizes, stock) | Not loaded yet. A sale window with real variants, prices, and stock has to exist before a real purchase can happen. |
| Payment confirmation | Not built. Until the Stripe webhook exists, an order stays `pending` even after the buyer pays. |

## One checkout, step by step

1. **The shop page asks for a payment link.** `POST /api/v1/shop/checkout-sessions`, with the
   buyer's cart in the body and a retry key in the `Idempotency-Key` header.
2. **The endpoint decides whether it may sell at all.** `backend/checkoutReadiness.js` answers from
   configuration, infrastructure flags, and the club's approvals. Off, or misconfigured → `503`.
3. **The buyer's request is read, or refused.** Only the cart and the retry key are accepted;
   anything else (a buyer, a price, a total) is rejected outright
   (`routes/api/v1/controllers/shop.js`).
4. **An earlier attempt under the same retry key is looked up.** A retry, a refresh, or a double
   press must find its own attempt — even if checkout has since been switched off
   (`services/checkoutCoordinator.js`).
5. **For a new attempt: the sale window is found, the cart is priced, and stock is taken.**
   Prices come from the catalog, never from the browser (`shop/domain.js`, `shop/reservations.js`).
6. **The attempt is written down before Stripe is contacted**: the pending order, the stock holds,
   the agreed prices, and the exact Stripe request — all in one database transaction. If that
   fails, nothing is written.
7. **Stripe is asked for a payment link**, using a key derived from our attempt id, so a retry can
   never become a second charge (`services/stripeProviderClient.js`).
8. **The link is attached to the attempt** — but only if the attempt is still waiting and the link
   is still open and unexpired. The buyer gets the link; everyone else who retries gets the same
   answer instead of a new charge.

## Words used in this code

| Term | In code | In the database | What it means | Example |
|---|---|---|---|---|
| Product | `productKey` | `productKey` | A style of merchandise, regardless of size or colour. | The IUGA hoodie. |
| Variant | `skuKey` | `skuKey` | One buyable version of a product — **this is what the shop page sends**. | The hoodie, purple, size M. |
| Stock pile | `fulfillmentSku` | `fulfillmentSku` | The physical pile of stock we actually count. Several variants can share one pile. | `HOODIE-PURPLE-M` |
| Sale window | `activeSalesWindow` | `ShopDrop` row (`dropKey`) | A period during which a set of products can be ordered, with its own price list. | Fall 2026: opens Oct 1, closes Nov 1. |
| Price list revision | — | `catalogVersion` | Which approved price list the sale window used. Stored on orders so an old order can still be read after prices change. | `catalog-2026-09` |
| Cart | `cart` | — | The variants and quantities the buyer wants, sorted and de-duplicated. | 1 hoodie, 2 totes. |
| Price snapshot | `snapshotQuote` | `quoteSnapshot` | The prices, quantities, and total the buyer agreed to, locked at the moment they pressed Pay. | Hoodie ×1 at $65.00 → $65.00. |
| Checkout attempt | `attempt` | `CheckoutAttempt` | One press of Pay, identified by the buyer's retry key. A retry resumes this attempt instead of starting a second one. | Pressing Pay twice after a timeout. |
| Retry key | `attemptKey` | `attemptKey` | The browser's `Idempotency-Key` header, lower-cased. Same key + same cart = the same purchase. | `550e8400-e29b-…` |
| Stripe key | `providerIdempotencyKey` | `providerIdempotencyKey` | The key we hand Stripe, derived from our attempt id — never from the browser. | `iuga:checkout:<attempt id>` |
| Order | `order` | `Order` | What the buyer is buying, at what price, and how far it has got. | `ORD-9f2c…` |
| Order reference | `orderReference` | `orderReference` | The id the buyer sees, instead of our internal database id. | `ORD-9f2c…` |
| Hold / reservation | `holdInventory` | `InventoryReservation` | Stock taken off the shelf at checkout, before payment, and given back if the attempt dies. | 1 hoodie held. |
| Stock counters | `available` / `reserved` / `consumed` | `InventoryCounter` | Per pile: on the shelf, held for somebody, permanently sold. | 8 available, 2 reserved, 10 sold. |
| Fence | — | — | A conditional stock update that fails if the numbers changed since we read them, so two workers cannot both take the last item. | `reserved: { $gte: 1 }` |
| Needs a human check | `needsManualCheckResult` | `reconciliation_required` | We cannot tell whether Stripe created a payment link, so a person must look before we retry. | A timeout mid-dispatch. |
| Ready | `readyResult` | `status: "ready"` | The attempt has a payment link that is still open and unexpired. | The buyer's link. |
| Readiness | `evaluateCheckoutReadiness` | — | Whether checkout may run at all, evaluated fresh on every request. | `checkoutEnabled: false`. |

## Rules the code enforces

- **Fail closed.** Checkout is off unless configuration, infrastructure, and approvals all pass —
  and the answer is re-checked on every request, not just at boot.
- **One attempt per buyer and retry key.** Two buyers using the same retry key can never share an
  attempt, an order, or a payment link.
- **The server owns the money.** Identity comes from the session; prices, quantities, totals, and
  return URLs come from our catalog and configuration. The browser sends a cart and a retry key.
- **Written down before money moves.** The order, its stock holds, and the Stripe request are
  committed first; the payment link is attached afterwards, and only while the attempt is waiting.
- **Stock is held, then sold, and only given back with proof.** `releaseInventory` refuses unless
  we can verify the payment link can no longer be paid — otherwise a buyer could pay for stock we
  already put back on the shelf.
- **Unclear outcomes stop.** A timeout or an unreadable answer becomes `reconciliation_required`,
  never an automatic retry with a new key.

## Where the code lives

| File | What it owns |
|---|---|
| `backend/routes/api/v1/controllers/shop.js` | The HTTP endpoint, its request rules, and its response contract. |
| `backend/services/checkoutCoordinator.js` | One checkout attempt from start to finish: retries, pricing, recording, Stripe, attaching the link. |
| `backend/services/stripeProviderClient.js` | Every call to Stripe, and the only place our Stripe key is used. |
| `backend/shop/domain.js` | Cart rules, sale-window rules, the price snapshot, and how an order moves through payment, fulfilment, refund, and dispute. No database, no network. |
| `backend/shop/reservations.js` | Stock: holding it, selling it, putting it back. |
| `backend/checkoutReadiness.js` | Whether checkout may run at all. |
| `backend/schemas/schemas.js` (submodule `iuga-web-schemas`) | The database shape: catalog, sale window, stock counters, reservations, attempts, orders, refunds, disputes. |

Models registered for the shop: `CatalogEntry`, `ShopDrop`, `InventoryCounter`,
`InventoryReservation`, `CheckoutAttempt`, `Order`, `RefundOperation`, `Dispute`,
`StripeInboxEvent`, `OrderActivity`.

## Known gaps

- **Payment confirmation is missing**, so paying does not yet mark an order paid, sell the held
  stock, or trigger fulfilment.
- **Nothing expires a hold yet.** A hold is written with a 15-minute lifetime while the payment
  link lives for an hour; until the expiry work exists, holds are only released by hand.
- **Two fulfilment/refund details do not line up** between the order state rules and the stored
  order shape (`fulfillmentMethod` vs `fulfillmentMode`, and a few fields the rules return that the
  order document does not store). Both are queued as their own fixes.
- **The shop page has no cart or buy button**, so the endpoint can only be exercised by tests and
  by hand until that work lands.

## Related

- [Backend](BACKEND.md) — routes, middleware order, models, and the submodule boundary.
- [Development](DEVELOPMENT.md) — the Stripe environment variables the readiness check reads.
- [Deployment](DEPLOYMENT.md) — pipeline and credentials.
