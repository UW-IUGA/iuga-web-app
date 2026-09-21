/*
Purpose: Coordinate the shop checkout flow: validate the buyer, resume or prepare an attempt, persist it, and attach a Stripe payment link.
Authentication/Authorization Requirements: Signed-in user session. The buyer identity is taken from the session and never from the request body.
Expected Request Information:
- Storage models, authenticated buyer owner, attempt key, cart items, readiness flag, and optional test seams.
Expected Response Information:
- A checkout result object: ready (with payment URL), pending, reconciliation_required, conflict, finished status, or unavailable.
*/

import mongoose from "mongoose";
import { normalizeAttemptKey, normalizeCart } from "../domain.js";
import { resumeExistingAttempt } from "./existingAttempt.js";
import { persistNewCheckout } from "./persistence.js";
import { prepareNewCheckout } from "./preparation.js";
import { createPaymentSession } from "./paymentSession.js";
import {
  conflictResult,
  stillProcessingResult,
  unavailable,
} from "./results.js";

/**
 * @behavior Turn a validation failure into a 400 error that carries a generic message only, so no
 *           internal rule, record, or configuration detail reaches the buyer.
 * @param message — the error message explaining why validation failed
 */
export class CheckoutValidationError extends Error {
  constructor(message = "Invalid checkout request") {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

/**
 * @behavior Validate the signed-in buyer identity before storing them as the checkout owner.
 * @param buyer — the buyer object from the session, which must be { type: "user", userId }
 * @returns normalized owner object with type "user" and trimmed userId
 * @exceptions CheckoutValidationError when the buyer is missing, not a user, or lacks a userId
 */
function validateBuyer(buyer) {
  if (
    !buyer ||
    buyer.type !== "user" ||
    typeof buyer.userId !== "string" ||
    !buyer.userId.trim()
  ) {
    throw new CheckoutValidationError("Invalid checkout owner");
  }
  return { type: "user", userId: buyer.userId };
}

/**
 * @behavior Require the shop's own https address, so stored return links cannot point at another
 *           site.
 * @param baseUrl — the configured public shop origin
 * @returns the normalized origin without a trailing slash
 * @exceptions CheckoutValidationError when the URL is missing or contains extra URL parts
 */
function validateBaseUrl(baseUrl) {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    throw new CheckoutValidationError("Invalid checkout base URL");
  }
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new CheckoutValidationError("Invalid checkout base URL");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new CheckoutValidationError("Invalid checkout base URL");
  }
  return parsed.toString().replace(/\/$/, "");
}

/**
 * @behavior Read the human-readable order reference from the order record linked to an attempt.
 * @param models — Mongoose models providing the Order collection
 * @param attempt — the checkout attempt record containing the orderId
 * @returns the order reference string (such as "ORD-..."), or null if the order was not found
 * @exceptions rejects when the database query fails
 */
async function readOrderReference(models, attempt) {
  const order = await models.Order.findById(attempt.orderId);
  return order?.orderReference ?? null;
}

/**
 * @behavior Execute database operations inside a single transaction so a half-written attempt is impossible.
 * @param work — callback function that receives the database session and runs writes
 * @returns the result of the transaction callback
 * @exceptions rejects if any operation in the transaction fails or the transaction aborts
 */
function runInTransaction(work) {
  return mongoose.connection.transaction(work);
}

/**
 * @behavior Create a Stripe provider client using the deployment's environment credentials.
 * @returns a configured Stripe provider client instance
 * @exceptions StripeProviderError when the Stripe environment variables are missing or invalid
 */
async function defaultProvider() {
  const { createStripeProviderClient } =
    await import("../../services/stripeProviderClient.js");
  return createStripeProviderClient({
    secretKey: process.env.STRIPE_SECRET_KEY,
    apiVersion: process.env.STRIPE_API_VERSION,
    fetchImpl: globalThis.fetch,
  });
}

/**
 * @behavior Coerce a clock seam — a Date, timestamp, or supplier function — into a valid Date object.
 * @param clock — a Date, timestamp string/number, or function returning one
 * @returns a valid Date instance representing the checkout time
 * @exceptions CheckoutValidationError when the clock value cannot be parsed into a valid Date
 */
function coerceNowToDate(clock) {
  const value = typeof clock === "function" ? clock() : clock;
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new CheckoutValidationError("Invalid checkout clock");
  return date;
}

/**
 * @behavior Replay this buyer's attempt for the retry key, or create one: price the cart, take
 *           stock, record the attempt, then ask Stripe for a payment link. Whenever the outcome
 *           is unclear it answers from durable state instead of risking a second charge.
 * @param models — the storage collections checkout reads and writes
 * @param owner — the signed-in buyer, taken from the session only
 * @param attemptKey — the browser's retry key from the Idempotency-Key header, lower-cased
 * @param items — the cart items exactly as the browser sent them
 * @param checkoutEnabled — readiness flag; false refuses a new attempt
 * @param getProvider — factory function returning the configured Stripe provider client
 * @param baseUrl — the configured public shop origin
 * @param now — current checkout timestamp or clock function
 * @param transaction — database transaction runner that commits all writes as a unit
 * @param createId — optional custom identifier generator function
 * @returns ready (with a payment link), pending, conflict, a terminal status, or unavailable
 * @exceptions CheckoutValidationError for an unusable owner, retry key, base URL, cart, or clock
 */
export async function createCheckout({
  models,
  owner,
  attemptKey,
  items,
  checkoutEnabled = false,
  getProvider = defaultProvider,
  baseUrl = process.env.STRIPE_BASE_URL,
  now = new Date(),
  transaction = runInTransaction,
  createId,
} = {}) {
  const normalizedOwner = validateBuyer(owner);
  let normalizedAttemptKey;
  try {
    normalizedAttemptKey = normalizeAttemptKey(attemptKey);
  } catch (error) {
    throw new CheckoutValidationError(error.message);
  }
  const checkoutNow = coerceNowToDate(now);
  let cart;
  try {
    cart = normalizeCart(items);
  } catch (error) {
    throw new CheckoutValidationError(error.message);
  }
  if (!models?.CheckoutAttempt || !models?.Order) {
    throw new CheckoutValidationError("Checkout storage is unavailable");
  }

  // Scoped to this buyer, so one buyer's retry key can never reach another buyer's attempt.
  const attemptQuery = {
    "owner.type": normalizedOwner.type,
    "owner.userId": normalizedOwner.userId,
    attemptKey: normalizedAttemptKey,
  };
  const requestCart = JSON.stringify(cart);

  // Look for this buyer's earlier attempt first. A retry, refresh, or double press must find its
  // own attempt even when checkout has since been switched off.
  const existingAttempt = await models.CheckoutAttempt.findOne(attemptQuery);
  if (existingAttempt) {
    return resumeExistingAttempt({
      models,
      existingAttempt,
      requestCart,
      checkoutEnabled,
      checkoutNow,
      getProvider,
      normalizedAttemptKey,
      attemptQuery,
    });
  }

  if (!checkoutEnabled) return unavailable();
  const checkout = await prepareNewCheckout({
    models,
    cart,
    normalizedOwner,
    normalizedAttemptKey,
    requestCart,
    checkoutNow,
    baseUrl,
    validateBaseUrl,
    createId,
  });
  if (!checkout) return unavailable();

  const persistence = await persistNewCheckout({
    models,
    checkout,
    transaction,
  });

  if (!persistence.ok) {
    // A duplicate-key failure means another request is already writing this buyer's attempt;
    // answer from that attempt instead of starting a second order.
    if (persistence.error?.code === 11000) {
      const raced = await models.CheckoutAttempt.findOne(attemptQuery);
      if (raced) {
        if (raced.attemptCart !== requestCart) return conflictResult();
        const racedReference = await readOrderReference(models, raced);
        if (racedReference) return stillProcessingResult(raced, racedReference);
      }
    }
    return unavailable();
  }
  return createPaymentSession({ models, checkout, getProvider });
}
