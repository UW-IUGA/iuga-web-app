/*
Purpose: Provide the shop HTTP checkout endpoint that validates carts and returns Stripe payment links.
Authentication/Authorization Requirements: A signed-in session. State-changing requests must also come from a trusted shop origin and are rate limited; both are enforced globally in app.js before this router runs.
Expected Request Information:
- Header `Idempotency-Key`: a UUIDv4 the browser repeats when retrying the same purchase
- Body: `{ "items": [ { "skuKey": <catalog variant>, "quantity": <whole number, 1 or more> } ] }`
- Nothing else: no buyer, no prices, no totals
Expected Response Information:
- 201 { attemptKey, orderReference, status: "ready", checkoutUrl } for a new attempt, ready to pay
- 200 { attemptKey, orderReference, status: "ready", checkoutUrl } for the same attempt, asked again
- 200 { attemptKey, orderReference, status: "expired" | "failed" } for a finished attempt, no link to give
- 202 { attemptKey, orderReference, status: "pending" } when recorded, ask again shortly
- 202 { attemptKey, orderReference, status: "reconciliation_required" } when an admin must check Stripe
- 400 when the request shape or retry key was not usable
- 401 when nobody is signed in
- 409 when the same retry key arrived with a different cart
- 503 when checkout is switched off, misconfigured, or unavailable for now
*/

import express from "express";
import { requireAuth } from "../utils/auth.js";
import { sendError } from "../helpers/sendError.js";
import { isFinishedAttempt, normalizeAttemptKey, normalizeCart } from "../../../../shop/domain.js";
import { createCheckout, CheckoutValidationError } from "../../../../shop/checkout/checkout.js";
import { createStripeProviderClient } from "../../../../services/stripeProviderClient.js";
import { evaluateCheckoutReadiness } from "../../../../shop/checkout/readiness.js";

const INVALID_REQUEST_MESSAGE = "Invalid checkout request";
const CHECKOUT_UNAVAILABLE_MESSAGE = "Checkout is currently unavailable";
const CHECKOUT_CONFLICT_MESSAGE = "Checkout request conflicts with an existing attempt";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/*
 * @behavior Read the buyer's request, or reject it with a message that reveals nothing. The body
 *           must be exactly { items }, because the server owns identity and money.
 * @param body — the raw request body
 * @param attemptKey — the browser's retry key, as the Idempotency-Key header arrived
 * @returns the lower-cased retry key and the normalized cart
 * @exceptions CheckoutValidationError when the key or the body is not exactly what we accept
 */
function readCheckoutRequest(body, attemptKey) {
  let normalizedAttemptKey;
  try {
    normalizedAttemptKey = normalizeAttemptKey(attemptKey);
  } catch (error) {
    throw new CheckoutValidationError(error.message);
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
  return { attemptKey: normalizedAttemptKey, items: normalizeCart(body.items) };
}

function stripeProviderFromEnvironment() {
  return createStripeProviderClient({
    secretKey: process.env.STRIPE_SECRET_KEY,
    apiVersion: process.env.STRIPE_API_VERSION,
    fetchImpl: globalThis.fetch,
  });
}

function resolveCheckoutEnabled(override) {
  if (typeof override === "boolean") return override;
  return evaluateCheckoutReadiness({ env: process.env }).checkoutEnabled;
}

/*
 * @behavior Build the shop's router. Injectable so tests can drive the endpoint without a
 *           database or Stripe.
 * @param options.checkout — the checkout flow to delegate to; defaults to the real one
 * @param options.checkoutEnabled — a boolean readiness override for tests
 * @returns an Express router mounted at /api/v1/shop
 */
export function createShopRouter({ checkout = createCheckout, checkoutEnabled } = {}) {
  const router = express.Router();
  /*
   * @behavior Create or retrieve a Stripe checkout session for the buyer's cart. Only authenticated
   *           users may call this endpoint.
   * @param req — the Express request with the Idempotency-Key header, items body, and session
   * @param res — the Express response
   * @returns 201 with checkout URL for a new session; 200 with checkout URL on repeated attempts or
   *          status for finished attempts; 202 when pending or needing reconciliation; 400 when the
   *          request shape or retry key is invalid; 401 when unauthenticated; 409 when the retry key
   *          conflicts with an existing attempt; or 503 when checkout is disabled or Stripe fails
   */
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
      if (isFinishedAttempt(result?.status)) {
        return res.status(200).json({
          attemptKey: result.attemptKey,
          orderReference: result.orderReference,
          status: result.status,
        });
      }
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
