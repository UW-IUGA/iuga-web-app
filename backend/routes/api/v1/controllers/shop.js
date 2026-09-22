/*
Purpose: Serve merchandise shop catalog information to prospective buyers.
         Provides public endpoints for browsing available apparel, allowed sizes,
         pricing, and the drop's sale window state.

Authentication/Authorization Requirements:
- GET /catalog: None (public browsing, unauthenticated)
- POST /checkout: Logged in (authenticated session required)

Expected Request Information:
- GET /catalog: None
- POST /checkout: req.body { items: [{ sku, size, quantity }], catalogVersion: string }

Expected Response Information:
- GET /catalog: 200 { status: "success", catalog: { ... } }
- POST /checkout: 200 { status: "success", url: string }
  - 400 Malformed body or invalid cart items
  - 401 Not authenticated
  - 409 Stale catalogVersion, scheduled sale, or closed sale
  - 503 Provider unconfigured, missing return URL, or provider failure
*/

import express from "express";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import {
  expiresAtSeconds,
  publicCatalog,
  resolveCartLines,
  saleStateAt,
} from "../utils/shopCatalog.js";
import { requireAuth } from "../utils/auth.js";
/*
 * @behavior Factory creating an Express router for shop endpoints with dependency injection.
 * @param options.stripe — Stripe SDK client instance with checkout session capabilities
 * @param options.catalog — catalog definition containing dropId, version, currency, dates, and items
 * @param options.now — clock function returning current timestamp in milliseconds (defaults to Date.now)
 * @param options.returnBaseUrl — origin for client return redirects (e.g., http://localhost:3000)
 * @returns Express router instance
 */
export function createShopRouter({
  stripe,
  catalog,
  now = Date.now,
  returnBaseUrl,
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

  /*
  Purpose: Create a hosted Stripe Checkout Session for the signed-in user's cart.
  Authentication/Authorization Requirements: Logged in.
  Expected Request Information:
  - req.body: { items: [{ sku, size, quantity }], catalogVersion: string }
  Expected Response Information:
  - 200 { status: "success", url: string }
  - 400 Malformed body, invalid cart items, or missing catalogVersion
  - 401 Not authenticated
  - 409 Stale catalogVersion, sale scheduled, or sale closed
  - 503 Stripe unconfigured, missing return URL, or provider error
  */
  router.post("/checkout", requireAuth, async (req, res) => {
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

    if (!stripe || typeof stripe.checkout?.sessions?.create !== "function") {
      return sendError(res, 503, "Payment service is currently unavailable.");
    }

    if (typeof returnBaseUrl !== "string" || returnBaseUrl.trim() === "") {
      return sendError(res, 503, "Payment service is currently unavailable.");
    }

    const cleanReturnBaseUrl = returnBaseUrl.trim().replace(/\/+$/, "");
    const metadata = {
      source: "iuga_shop",
      drop_id: catalog.dropId,
      catalog_version: catalog.catalogVersion,
      user_id: String(req.session.userId),
    };

    const line_items = cartResult.lines.map((line) => ({
      price_data: {
        currency: catalog.currency,
        unit_amount: line.unitAmount,
        product_data: {
          name: `${line.name} (${line.size})`,
          metadata: {
            sku: line.sku,
            size: line.size,
          },
        },
      },
      quantity: line.quantity,
    }));

    const sessionParams = {
      mode: "payment",
      allowed_payment_method_types: ["card"],
      phone_number_collection: { enabled: true },
      line_items,
      expires_at: expiresAtSeconds(catalog, currentMs),
      client_reference_id: String(req.session.userId),
      metadata,
      payment_intent_data: {
        metadata,
      },
      success_url: `${cleanReturnBaseUrl}/shop?checkout=complete`,
      cancel_url: `${cleanReturnBaseUrl}/shop?checkout=canceled`,
    };

    if (typeof req.session?.email === "string" && req.session.email.trim() !== "") {
      sessionParams.customer_email = req.session.email;
    }

    let session;
    try {
      session = await stripe.checkout.sessions.create(sessionParams);
    } catch (error) {
      console.error("Stripe session creation failed:", {
        type: error?.type ?? "unknown",
        code: error?.code ?? "unknown",
        requestId: error?.requestId ?? "unknown",
      });
      return sendError(res, 503, "Payment service is currently unavailable.");
    }

    if (!session?.url) {
      console.error("Stripe session returned no URL");
      return sendError(res, 503, "Payment service is currently unavailable.");
    }

    return sendSuccess(res, { url: session.url });
  });

  return router;
}
