/*
Purpose: The shop's HTTP entry point. It answers one question for the browser — "what is the
         payment link for this cart, if there is one?" — and refuses anything the browser
         should not be deciding (who the buyer is, what things cost, how many are left).

Authentication/Authorization Requirements: A signed-in UW session. State-changing requests must
    also come from a trusted shop origin and are rate limited; both are enforced globally in
    app.js before this router runs.

Expected Request Information:
- header `Idempotency-Key` — a UUIDv4 the browser repeats when it retries the same purchase.
- body `{ "items": [ { "skuKey": <catalog variant>, "quantity": <whole number, 1 or more> } ] }`
- nothing else: no buyer, no prices, no totals.

Expected Response Information:
- 201 { attemptKey, orderReference, status: "ready", checkoutUrl }   a new attempt, ready to pay
- 200 { attemptKey, orderReference, status: "ready", checkoutUrl }   the same attempt, asked again
- 200 { attemptKey, orderReference, status: "expired" | "failed" }   finished, no link to give
- 202 { attemptKey, orderReference, status: "pending" }              recorded, ask again shortly
- 202 { attemptKey, orderReference, status: "reconciliation_required" } a human must check Stripe
- 400 the request was not usable
- 401 nobody is signed in
- 409 the same retry key arrived with a different cart
- 503 checkout is switched off, misconfigured, or unavailable for now
*/

import express from "express";
import { requireAuth } from "../utils/auth.js";
import { sendError } from "../helpers/sendError.js";
import { normalizeCart } from "../../../../shop/domain.js";
import { createCheckout, CheckoutValidationError } from "../../../../services/checkoutCoordinator.js";
import { createStripeProviderClient } from "../../../../services/stripeProviderClient.js";
import { evaluateCheckoutReadiness } from "../../../../checkoutReadiness.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_REQUEST_MESSAGE = "Invalid checkout request";
const CHECKOUT_UNAVAILABLE_MESSAGE = "Checkout is currently unavailable";
const CHECKOUT_CONFLICT_MESSAGE = "Checkout request conflicts with an existing attempt";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/*
Purpose: Read the buyer's request, or reject it with a message that reveals nothing.
Why: the body must be exactly { items }. Anything else — a buyer, a price, a total — is refused
     rather than ignored, because the server owns identity and money, and a silently ignored
     field is how a client ends up believing it decided the price.
*/
function readCheckoutRequest(body, idempotencyKeyHeader) {
  if (typeof idempotencyKeyHeader !== "string" || !UUID_V4.test(idempotencyKeyHeader)) {
    throw new CheckoutValidationError(INVALID_REQUEST_MESSAGE);
  }
  if (!isPlainObject(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "items")) {
    throw new CheckoutValidationError(INVALID_REQUEST_MESSAGE);
  }
  if (!Array.isArray(body.items)) {
    throw new CheckoutValidationError(INVALID_REQUEST_MESSAGE);
  }
  for (const item of body.items) {
    if (!isPlainObject(item) || Object.keys(item).length !== 2 ||
        !Object.hasOwn(item, "skuKey") || !Object.hasOwn(item, "quantity")) {
      throw new CheckoutValidationError(INVALID_REQUEST_MESSAGE);
    }
  }
  // The retry key is stored lower-cased, so the same press of Pay always compares equal.
  return { attemptKey: idempotencyKeyHeader.toLowerCase(), items: normalizeCart(body.items) };
}

// Reach Stripe with this deployment's credentials; the coordinator owns when to call it.
function stripeProviderFromEnvironment() {
  return createStripeProviderClient({
    secretKey: process.env.STRIPE_SECRET_KEY,
    apiVersion: process.env.STRIPE_API_VERSION,
    fetchImpl: globalThis.fetch,
  });
}

/*
Purpose: Decide whether checkout may run at all, right now.
Why: production passes nothing here, so the fail-closed readiness gate is asked on every request
     and cannot be sidestepped by a running process. Tests pass a boolean to choose an answer.
*/
function resolveCheckoutEnabled(override) {
  if (typeof override === "boolean") return override;
  return evaluateCheckoutReadiness({ env: process.env }).checkoutEnabled;
}

/*
 * Purpose: Build the shop's router. Injectable so tests can drive the endpoint without a
 *          database or Stripe.
 * @param options.checkout — the checkout flow to delegate to; defaults to the real one.
 * @param options.checkoutEnabled — a boolean readiness override for tests.
 * @returns an Express router mounted at /api/v1/shop.
 */
export function createShopRouter({ checkout = createCheckout, checkoutEnabled } = {}) {
  const router = express.Router();
  router.post("/checkout-sessions", requireAuth, async (req, res) => {
    // requireAuth only tells us somebody is signed in; the buyer identity we trust is this id.
    const sessionUserId = req.session?.userId;
    if (
      sessionUserId === null ||
      sessionUserId === undefined ||
      String(sessionUserId).trim() === ""
    ) {
      return sendError(res, 401, "Not authenticated");
    }

    let request;
    try {
      request = readCheckoutRequest(req.body, req.get("Idempotency-Key"));
    } catch {
      return sendError(res, 400, INVALID_REQUEST_MESSAGE);
    }

    try {
      const result = await checkout({
        models: req.models,
        // The owner comes from the session only; the browser never names the buyer.
        owner: { type: "user", userId: String(req.session.userId) },
        attemptKey: request.attemptKey,
        items: request.items,
        checkoutEnabled: resolveCheckoutEnabled(checkoutEnabled),
        baseUrl: process.env.STRIPE_BASE_URL,
        getProvider: stripeProviderFromEnvironment,
      });

      if (result?.status === "ready") {
        const body = {
          attemptKey: result.attemptKey,
          orderReference: result.orderReference,
          status: "ready",
          checkoutUrl: result.checkoutUrl,
        };
        return res.status(result.isNew === false ? 200 : 201).json(body);
      }
      // The attempt is over. Answer 200 so a client stops asking, and hand back no link.
      if (result?.status === "expired" || result?.status === "failed") {
        return res.status(200).json({
          attemptKey: result.attemptKey,
          orderReference: result.orderReference,
          status: result.status,
        });
      }
      // Still in progress, or waiting for a human: no link either way.
      if (result?.status === "pending" || result?.status === "reconciliation_required") {
        return res.status(202).json({
          attemptKey: result.attemptKey,
          orderReference: result.orderReference,
          status: result.status,
        });
      }
      if (result?.status === "conflict") return sendError(res, 409, CHECKOUT_CONFLICT_MESSAGE);
      return sendError(res, 503, CHECKOUT_UNAVAILABLE_MESSAGE);
    } catch (error) {
      if (error instanceof CheckoutValidationError) return sendError(res, 400, INVALID_REQUEST_MESSAGE);
      return sendError(res, 503, CHECKOUT_UNAVAILABLE_MESSAGE);
    }
  });

  return router;
}

const router = createShopRouter();
export default router;
