/*
 * @behavior Run the whole checkout flow for one buyer: record the attempt, its stock holds,
 *           and its agreed prices, then ask Stripe for a payment link. Pressing Pay twice,
 *           retrying after a timeout, or reloading always lands on the same attempt and never
 *           on a second charge.
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

/*
 * @behavior Turn a validation failure into a 400 that carries a generic message only, so no
 *           internal rule, record, or configuration detail reaches the buyer.
 */
export class CheckoutValidationError extends Error {
  constructor(message = "Invalid checkout request") {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

// Validate the signed-in buyer before storing their identity as the checkout owner.
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

/*
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

async function readOrderReference(models, attempt) {
  const order = await models.Order.findById(attempt.orderId);
  return order?.orderReference ?? null;
}

// Run work in one database transaction, so a half-written attempt is impossible.
function runInTransaction(work) {
  return mongoose.connection.transaction(work);
}

// Reach Stripe with this deployment's credentials. Tests and the shop controller inject their own.
async function defaultProvider() {
  const { createStripeProviderClient } =
    await import("../../services/stripeProviderClient.js");
  return createStripeProviderClient({
    secretKey: process.env.STRIPE_SECRET_KEY,
    apiVersion: process.env.STRIPE_API_VERSION,
    fetchImpl: globalThis.fetch,
  });
}

// The clock is a seam so tests can pin "now" and prove the sale-window rules.
function coerceNowToDate(clock) {
  const value = typeof clock === "function" ? clock() : clock;
  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new CheckoutValidationError("Invalid checkout clock");
  return date;
}

/*
 * @behavior Replay this buyer's attempt for the retry key, or create one: price the cart, take
 *           stock, record the attempt, then ask Stripe for a payment link. Whenever the outcome
 *           is unclear it answers from durable state instead of risking a second charge.
 * @param models — the storage collections checkout reads and writes
 * @param owner — the signed-in buyer, taken from the session only
 * @param attemptKey — the browser's Idempotency-Key, lower-cased
 * @param items — the cart exactly as the browser sent it
 * @param checkoutEnabled — readiness override; false refuses a new attempt
 * @param getProvider, now, transaction, createId — seams tests replace
 * @returns ready (with a link), pending, conflict, a terminal status, or unavailable
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
  const attemptFilter = {
    "owner.type": normalizedOwner.type,
    "owner.userId": normalizedOwner.userId,
    attemptKey: normalizedAttemptKey,
  };
  const cartFingerprint = JSON.stringify(cart);

  // Look for this buyer's earlier attempt first. A retry, refresh, or double press must find its
  // own attempt even when checkout has since been switched off.
  const existing = await models.CheckoutAttempt.findOne(attemptFilter);
  if (existing) {
    return resumeExistingAttempt({
      models,
      existing,
      cartFingerprint,
      checkoutEnabled,
      checkoutNow,
      getProvider,
      normalizedAttemptKey,
      attemptFilter,
    });
  }

  if (!checkoutEnabled) return unavailable();
  const checkout = await prepareNewCheckout({
    models,
    cart,
    normalizedOwner,
    normalizedAttemptKey,
    cartFingerprint,
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
      const raced = await models.CheckoutAttempt.findOne(attemptFilter);
      if (raced) {
        if (raced.cartFingerprint !== cartFingerprint) return conflictResult();
        const racedReference = await readOrderReference(models, raced);
        if (racedReference) return stillProcessingResult(raced, racedReference);
      }
    }
    return unavailable();
  }
  return createPaymentSession({ models, checkout, getProvider });
}
