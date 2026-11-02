/*
Purpose: Serve merchandise shop catalog information to prospective buyers.
         Provides public endpoints for browsing available apparel, allowed sizes,
         pricing, and the drop's sale window state.

Authentication/Authorization Requirements:
- GET /catalog: None (public browsing, unauthenticated)
- POST /checkout, GET /checkout/:sessionId: Logged in (authenticated session required)
- /holds routes (manual Venmo checkout): Logged in; every route returns 503 unless manualCheckoutExposed is true
- /purchases routes (officer order review): see shopReview.js; available whether or not checkout is exposed

Expected Request Information:
- GET /catalog: None
- POST /checkout: req.body { items: [{ sku, size, quantity }], catalogVersion: string }

Expected Response Information:
- GET /catalog: 200 { status: "success", catalog: { ... } }
- POST /checkout: 200 { status: "success", url: string, sessionId: string }
- GET /checkout/:sessionId: 200 { status: "success", paymentStatus: "paid" | "pending" }
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
import * as defaultCheckoutStore from "../utils/shopCheckoutStore.js";
import { ShopHoldError } from "../utils/shopCheckoutStore.js";
import { createShopReviewRouter } from "./shopReview.js";
import { checkoutStatusAt, holdTotalCents, normalizePhoneNumber, normalizeVenmoUsername } from "../utils/shopHolds.js";

const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const CHECKOUT_PAUSED_MESSAGE =
  "Checkout is paused for a few minutes while we update the shop. Your cart is saved. Please try again shortly.";

function publicHold(hold) {
  return {
    id: String(hold._id),
    status: hold.status,
    expiresAt: new Date(hold.expiresAt).toISOString(),
    lines: hold.lines.map((line) => ({
      sku: line.sku,
      name: line.name,
      size: line.size,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
    })),
    totalCents: holdTotalCents(hold.lines),
  };
}

function publicPurchase(purchase) {
  return {
    id: String(purchase._id),
    status: purchase.status,
    venmoUsername: purchase.venmoUsername,
    totalCents: purchase.totalCents,
    confirmedAt: new Date(purchase.confirmedAt).toISOString(),
  };
}

function sendHoldFailure(res, error) {
  if (error instanceof ShopHoldError) {
    return sendError(res, error.status, error.message);
  }
  console.error("Shop hold request failed:", error);
  return sendError(res, 500, "Unable to update your hold right now. Please try again.");
}

/*
 * @behavior Factory creating an Express router for shop endpoints with dependency injection.
 * @param options.stripe — Stripe SDK client instance with checkout session capabilities
 * @param options.catalog — catalog definition containing catalogId, version, currency, dates, and items
 * @param options.now — clock function returning current timestamp in milliseconds (defaults to Date.now)
 * @param options.returnBaseUrl — origin for client return redirects (e.g., http://localhost:3000)
 * @param options.stripeCheckoutExposed — when false (default), POST /checkout returns 503 before any Stripe call
 * @param options.manualCheckoutExposed — when false (default), every /holds route returns 503 before any database call
 * @param options.checkoutStore — checkout persistence functions (holds, limits, saved Venmo username); defaults to the MongoDB-backed store
 * @param options.reviewStore — officer order review functions; defaults to the MongoDB-backed store
 * @returns Express router instance
 */
export function createShopRouter({
  stripe,
  catalog,
  now = Date.now,
  returnBaseUrl,
  stripeCheckoutExposed = false,
  manualCheckoutExposed = false,
  checkoutStore = defaultCheckoutStore,
  reviewStore,
}) {
  const router = express.Router();

  // Accepted orders stay reviewable when new checkout is paused or not exposed.
  router.use(createShopReviewRouter({ reviewStore, now }));

  /*
  Purpose: Retrieve the public merchandise drop catalog and current sale window state.
  Authentication/Authorization Requirements: None (public browsing).
  Expected Request Information: None.
  Expected Response Information:
  - 200 { status: "success", catalog: publicCatalog(...) }
  - 500 The per-student limits could not be read
  */
  router.get("/catalog", async (req, res) => {
    const currentMs = now();
    let limits;
    try {
      limits = await checkoutStore.findLimits(req.models);
    } catch (error) {
      console.error("Shop catalog limits failed:", error);
      return sendError(res, 500, "Unable to load the shop catalog right now. Please try again.");
    }
    const catalogData = publicCatalog(catalog, currentMs, limits);
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
  Purpose: Create a hosted Stripe Checkout Session for the signed-in user's cart.
  Authentication/Authorization Requirements: Logged in.
  Expected Request Information:
  - req.body: { items: [{ sku, size, quantity }], catalogVersion: string }
  Expected Response Information:
  - 200 { status: "success", url: string, sessionId: string }
  - 400 Malformed body, invalid cart items, or missing catalogVersion
  - 401 Not authenticated
  - 409 Stale catalogVersion, sale scheduled, or sale closed
  - 503 Checkout not exposed, Stripe unconfigured, missing return URL, or provider error
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
      return sendError(res, 409, "The shop was updated. Please review your cart and check out again.");
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

    if (stripeCheckoutExposed !== true) {
      return sendError(
        res,
        503,
        "Online checkout is temporarily unavailable. Your cart has not changed; please check back later."
      );
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
      drop_id: catalog.catalogId,
      catalog_version: catalog.catalogVersion,
      user_id: String(req.session.userId),
    };

    const line_items = cartResult.lines.map((line) => ({
      price_data: {
        currency: catalog.currency,
        unit_amount: line.unitPriceCents,
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
      // Card rail only: wallets (Apple Pay, Google Pay) ride the card rail while delayed methods would break reconciliation that has no webhooks.
      payment_method_types: ["card"],
      phone_number_collection: { enabled: true },
      line_items,
      expires_at: expiresAtSeconds(catalog, currentMs),
      client_reference_id: String(req.session.userId),
      metadata,
      payment_intent_data: {
        metadata,
      },
      success_url: `${cleanReturnBaseUrl}/shop?checkout=complete&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cleanReturnBaseUrl}/shop?checkout=canceled`,
    };

    if (typeof req.session?.email === "string" && req.session.email.trim() !== "") {
      sessionParams.customer_email = req.session.email;
    }

    // Not in production: this Stripe Checkout Session path runs only when stripeCheckoutExposed is enabled.
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

    if (!session?.url || !session?.id) {
      console.error("Stripe session returned no URL or ID");
      return sendError(res, 503, "Payment service is currently unavailable.");
    }

    return sendSuccess(res, { url: session.url, sessionId: session.id });
  });

  /*
  Purpose: Tell the site whether shop checkout is paused or has a maintenance time announced, so it can warn
           students who have items in their cart.
  Authentication/Authorization Requirements: None (public, like the catalog).
  Expected Request Information: None.
  Expected Response Information:
  - 200 { status: "success", shop: { checkoutPaused: boolean, maintenanceAt: ISO string | null } }
    (maintenanceAt is null once that time has passed; checkoutPaused is then true)
  - 500 The settings could not be read
  */
  router.get("/status", async (req, res) => {
    // Where checkout is not offered there is nothing to warn about.
    if (manualCheckoutExposed !== true) {
      return sendSuccess(res, { shop: { checkoutPaused: false, maintenanceAt: null } });
    }
    try {
      const currentMs = now();
      const { checkoutPaused, maintenanceAtMs } = checkoutStatusAt(
        await checkoutStore.findCheckoutSettings(req.models),
        currentMs,
      );
      const upcoming = maintenanceAtMs !== null && maintenanceAtMs > currentMs;
      return sendSuccess(res, {
        shop: { checkoutPaused, maintenanceAt: upcoming ? new Date(maintenanceAtMs).toISOString() : null },
      });
    } catch (error) {
      console.error("Shop status failed:", error);
      return sendError(res, 500, "Unable to load the shop status right now.");
    }
  });

  // Checked before any hold route reads or writes the database. Production keeps
  // manualCheckoutExposed off until its database passes the replica-set tests.
  function manualCheckoutClosed(res) {
    if (manualCheckoutExposed !== true) {
      sendError(
        res,
        503,
        "Online checkout is temporarily unavailable. Your cart has not changed; please check back later."
      );
      return true;
    }
    return false;
  }

  /*
  Purpose: Hold the signed-in student's whole cart for the hold duration (15 minutes by default), or none of it.
  Authentication/Authorization Requirements: Logged in.
  Expected Request Information:
  - req.body: { items: [{ sku, size, quantity }], catalogVersion: string }
  Expected Response Information:
  - 200 { status: "success", hold: { id, status, expiresAt, lines, totalCents } }
  - 400 Malformed body or invalid cart items
  - 401 Not authenticated
  - 409 Stale catalogVersion, sale not open, or a line exceeds stock or the per-student limit
  - 503 Manual checkout not exposed, or new checkouts are paused by an officer
  */
  router.post("/holds", requireAuth, async (req, res) => {
    if (manualCheckoutClosed(res)) return;

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return sendError(res, 400, "Request body must be an object.");
    }
    if (typeof body.catalogVersion !== "string" || body.catalogVersion.trim() === "") {
      return sendError(res, 400, "catalogVersion must be a non-empty string.");
    }
    if (body.catalogVersion !== catalog.catalogVersion) {
      return sendError(res, 409, "The shop was updated. Please review your cart and check out again.");
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

    try {
      // Only new holds are paused. A student who already has a hold can still confirm or cancel it.
      const { checkoutPaused, maintenanceAtMs } = checkoutStatusAt(
        await checkoutStore.findCheckoutSettings(req.models),
        currentMs,
      );
      if (checkoutPaused) {
        return sendError(res, 503, CHECKOUT_PAUSED_MESSAGE);
      }
      const hold = await checkoutStore.createHold(req.models, {
        maintenanceAtMs,
        userId: req.session.userId,
        catalogId: catalog.catalogId,
        catalogVersion: catalog.catalogVersion,
        lines: cartResult.lines,
        nowMs: currentMs,
      });
      return sendSuccess(res, { hold: publicHold(hold) });
    } catch (error) {
      return sendHoldFailure(res, error);
    }
  });

  /*
  Purpose: Load one of the student's holds for the checkout page.
  Authentication/Authorization Requirements: Logged in; the hold must belong to the signed-in student.
  Expected Request Information: URL parameter holdId.
  Expected Response Information:
  - 200 { status: "success", hold, savedVenmoUsername } (hold status "expired" when the deadline has passed;
    savedVenmoUsername is the student's username from an earlier purchase, or null)
  - 401 Not authenticated
  - 404 Hold not found
  - 503 Manual checkout not exposed
  */
  router.get("/holds/:holdId", requireAuth, async (req, res) => {
    if (manualCheckoutClosed(res)) return;
    if (!OBJECT_ID_PATTERN.test(req.params.holdId)) {
      return sendError(res, 404, "Hold not found.");
    }

    try {
      const hold = await checkoutStore.getHold(req.models, {
        holdId: req.params.holdId,
        userId: req.session.userId,
        nowMs: now(),
      });
      const savedVenmoUsername = await checkoutStore.findSavedVenmoUsername(req.models, req.session.userId);
      return sendSuccess(res, { hold: publicHold(hold), savedVenmoUsername });
    } catch (error) {
      return sendHoldFailure(res, error);
    }
  });

  /*
  Purpose: Cancel an active hold and release its units.
  Authentication/Authorization Requirements: Logged in; the hold must belong to the signed-in student.
  Expected Request Information: URL parameter holdId.
  Expected Response Information:
  - 200 { status: "success", hold } with status "cancelled"
  - 401 Not authenticated
  - 404 Hold not found
  - 409 Hold is not active or has expired
  - 503 Manual checkout not exposed
  */
  router.delete("/holds/:holdId", requireAuth, async (req, res) => {
    if (manualCheckoutClosed(res)) return;
    if (!OBJECT_ID_PATTERN.test(req.params.holdId)) {
      return sendError(res, 404, "Hold not found.");
    }

    try {
      const hold = await checkoutStore.cancelHold(req.models, {
        holdId: req.params.holdId,
        userId: req.session.userId,
        nowMs: now(),
      });
      return sendSuccess(res, { hold: publicHold(hold) });
    } catch (error) {
      return sendHoldFailure(res, error);
    }
  });

  /*
  Purpose: Remove one line from an active hold. The deadline does not change. Removing the last line cancels the hold.
  Authentication/Authorization Requirements: Logged in; the hold must belong to the signed-in student.
  Expected Request Information:
  - URL parameter holdId
  - req.body: { sku: string, size: string }
  Expected Response Information:
  - 200 { status: "success", hold }
  - 400 Missing sku or size
  - 401 Not authenticated
  - 404 Hold or line not found
  - 409 Hold is not active or has expired
  - 503 Manual checkout not exposed
  */
  router.patch("/holds/:holdId/lines", requireAuth, async (req, res) => {
    if (manualCheckoutClosed(res)) return;
    if (!OBJECT_ID_PATTERN.test(req.params.holdId)) {
      return sendError(res, 404, "Hold not found.");
    }

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        typeof body.sku !== "string" || typeof body.size !== "string") {
      return sendError(res, 400, "sku and size must be strings.");
    }

    try {
      const hold = await checkoutStore.removeLineFromHold(req.models, {
        holdId: req.params.holdId,
        userId: req.session.userId,
        sku: body.sku,
        size: body.size,
        nowMs: now(),
      });
      return sendSuccess(res, { hold: publicHold(hold) });
    } catch (error) {
      return sendHoldFailure(res, error);
    }
  });

  /*
  Purpose: Confirm an active hold before its deadline. Creates a pending purchase and saves the Venmo username and phone number to the profile.
  Authentication/Authorization Requirements: Logged in; the hold must belong to the signed-in student.
  Expected Request Information:
  - URL parameter holdId
  - req.body: { venmoUsername: string, phoneNumber: string }
  Expected Response Information:
  - 200 { status: "success", purchase: { id, status, venmoUsername, totalCents, confirmedAt } }
  - 400 Missing or invalid Venmo username or phone number
  - 401 Not authenticated
  - 404 Hold not found
  - 409 Hold is not active, its deadline has passed (its items are released), or the Venmo username
    differs from the one saved by an earlier purchase (the hold stays active)
  - 503 Manual checkout not exposed
  */
  router.post("/holds/:holdId/confirm", requireAuth, async (req, res) => {
    if (manualCheckoutClosed(res)) return;
    if (!OBJECT_ID_PATTERN.test(req.params.holdId)) {
      return sendError(res, 404, "Hold not found.");
    }

    const venmoUsername = normalizeVenmoUsername(req.body?.venmoUsername);
    if (venmoUsername === null) {
      return sendError(
        res,
        400,
        "Enter your Venmo username: 1 to 30 letters, numbers, periods, hyphens, or underscores."
      );
    }

    const phoneNumber = normalizePhoneNumber(req.body?.phoneNumber);
    if (phoneNumber === null) {
      return sendError(res, 400, "Enter a valid phone number: 7 to 15 digits, with a country code if it is not a US number.");
    }

    try {
      const purchase = await checkoutStore.confirmHold(req.models, {
        holdId: req.params.holdId,
        userId: req.session.userId,
        venmoUsername,
        phoneNumber,
        nowMs: now(),
      });
      return sendSuccess(res, { purchase: publicPurchase(purchase) });
    } catch (error) {
      return sendHoldFailure(res, error);
    }
  });

  return router;
}
