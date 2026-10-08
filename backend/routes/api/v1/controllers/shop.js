/*
Purpose: Serve merchandise shop catalog information to prospective buyers.
         Provides public endpoints for browsing available apparel, allowed sizes,
         pricing, and the drop's sale window state.

Authentication/Authorization Requirements:
- GET /catalog: None (public browsing, unauthenticated)
- POST /checkout, GET /checkout/:sessionId: Logged in (authenticated session required)

Expected Request Information:
- GET /catalog: None
- POST /checkout: req.body { items: [{ sku, size, quantity }], catalogVersion: string }

Expected Response Information:
- GET /catalog: 200 { status: "success", catalog: { ... } }
- POST /checkout: 503 { status: "error", message: string } (new checkout is unavailable)
- GET /checkout/:sessionId: 200 { status: "success", paymentStatus: "paid" | "pending" }
  - 400 Malformed body or invalid cart items
  - 401 Not authenticated
  - 409 Stale catalogVersion, scheduled sale, or closed sale
- 503 New checkout unavailable or legacy payment verification unavailable
*/

import express from "express";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { publicCatalog, resolveCartLines, saleStateAt } from "../utils/shopCatalog.js";
import { requireAuth } from "../utils/auth.js";
/*
 * @behavior Factory creating an Express router for shop endpoints with dependency injection.
 * @param options.stripe — Stripe SDK client for verifying existing checkout sessions
 * @param options.catalog — catalog definition containing catalogId, version, currency, dates, and items
 * @param options.now — clock function returning current timestamp in milliseconds (defaults to Date.now)
 * @returns Express router instance
 */
export function createShopRouter({
  stripe,
  catalog,
  now = Date.now,
}) {
  const router = express.Router();

  /*
  Purpose: Retrieve the public merchandise drop catalog and current sale window state.
  Authentication/Authorization Requirements: None (public browsing).
  Expected Request Information: None.
  Expected Response Information:
  - 200 { status: "success", catalog: publicCatalog(...) }
  */
  router.get("/catalog", (_req, res) => {
    const currentMs = now();
    const catalogData = publicCatalog(catalog, currentMs);
    return sendSuccess(res, { catalog: catalogData });
  });

  // Only Stripe's session, scoped to this signed-in user, can confirm payment.
  router.get("/checkout/:sessionId", requireAuth, async (req, res) => {
    if (!stripe || typeof stripe.checkout?.sessions?.retrieve !== "function") {
      return sendError(res, 503, "Payment service is currently unavailable.");
    }

    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    } catch (error) {
      console.error("Stripe session lookup failed:", {
        type: error?.type ?? "unknown",
        code: error?.code ?? "unknown",
        requestId: error?.requestId ?? "unknown",
      });
      if (error?.type === "invalid_request_error") {
        return sendError(res, 404, "Checkout not found.");
      }
      return sendError(res, 503, "Unable to verify checkout at this time.");
    }

    if (session?.client_reference_id !== String(req.session.userId) ||
        session?.metadata?.user_id !== String(req.session.userId) ||
        session?.metadata?.source !== "iuga_shop" ||
        session?.metadata?.drop_id !== catalog.catalogId ||
        session?.mode !== "payment") {
      return sendError(res, 404, "Checkout not found.");
    }

    return sendSuccess(res, {
      paymentStatus: session.status === "complete" && session.payment_status === "paid"
        ? "paid" : "pending",
    });
  });

  /*
  Purpose: Keep the signed-in user's cart endpoint available while online checkout is paused.
  Authentication/Authorization Requirements: Logged in.
  Expected Request Information:
  - req.body: { items: [{ sku, size, quantity }], catalogVersion: string }
  Expected Response Information:
  - 400 Malformed body, invalid cart items, or missing catalogVersion
  - 401 Not authenticated
  - 409 Stale catalogVersion, sale scheduled, or sale closed
  - 503 Checkout is temporarily unavailable
  */
  router.post("/checkout", requireAuth, (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendError(res, 400, "Request body must be an object.");
    }

    if (typeof body.catalogVersion !== "string" || body.catalogVersion.trim() === "") {
      return sendError(res, 400, "catalogVersion must be a non-empty string.");
    }

    if (body.catalogVersion !== catalog.catalogVersion) {
      return sendError(res, 409, "Catalog version is out of date.");
    }

    const currentMs = now();
    const saleState = saleStateAt(catalog, currentMs);
    if (saleState === "scheduled") {
      return sendError(res, 409, "Sale has not opened yet.");
    }
    if (saleState === "closed") {
      return sendError(res, 409, "Sale is closed.");
    }

    const cartResult = resolveCartLines(catalog, body.items);
    if (!cartResult.ok) {
      return sendError(res, 400, cartResult.message);
    }

    return sendError(
      res,
      503,
      "Online checkout is temporarily unavailable. Your cart has not changed; please check back later.",
    );
  });

  return router;
}
