/*
 * @behavior The only code that talks to Stripe: create a hosted payment page from one
 *           already-priced purchase, read a checkout session back to see whether its payment link
 *           is still usable, and read what was actually paid. Prices, quantities, and identity are
 *           decided before anything here runs. No Stripe error body, API key, or internal
 *           identifier ever reaches a caller or a log.
 *
 * Expected Request Information: a purchase whose prices and quantities were frozen earlier, plus a
 * Stripe secret key, a pinned API version, and a function to make HTTP requests with.
 *
 * Expected Response Information: normalized checkout-session and payment-intent facts, or a
 * StripeProviderError carrying no Stripe detail.
 */

import { isWholeCents } from "../utils/money.js";

const CHECKOUT_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";
const PAYMENT_INTENTS_URL = "https://api.stripe.com/v1/payment_intents";

// The one source a payment may be judged on: our own authenticated read of the Stripe account.
const AUTHENTICATED_SERVER_RETRIEVAL = "authenticated_server_retrieval";

/*
 * @behavior Turn every Stripe boundary failure — bad configuration, a dead network, a rejection,
 *           or an untrustworthy response — into one generic error. Stripe's own message can repeat
 *           keys and payment details, so it never reaches the caller; only a category from this
 *           list does, so an admin can tell the stages apart when checking the attempt.
 */
const FAILURE_CODES = Object.freeze([
  "configuration",
  "invalid_request",
  "transport",
  "provider_rejection",
  "invalid_response",
]);

class StripeProviderError extends Error {
  constructor(code) {
    super("Stripe provider request failed");
    this.name = "StripeProviderError";
    this.code = FAILURE_CODES.includes(code) ? code : "unknown";
  }
}

/*
 * @behavior Refuse the current operation by throwing the one generic Stripe error. Every failure
 *           path in this file goes through here, so Stripe's own message can never reach a caller.
 *           Never returns.
 * @param code — which category of failure this is, from FAILURE_CODES
 * @exceptions StripeProviderError, always
 */
function failSafely(code) {
  throw new StripeProviderError(code);
}

/*
 * @behavior Check that a value is a string with something other than spaces in it.
 * @param value — the value to check
 * @returns true when the value is a string that is not empty once trimmed
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/*
 * @behavior Check that a value is a whole number of seconds since 1970, the way Stripe reports an
 *           expiry — never milliseconds.
 * @param value — the value to check
 * @returns true when the value is a safe integer above zero
 */
function isEpochSeconds(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/*
 * @behavior Read a value as text, treating anything that is not a string as absent.
 * @param value — the value to read
 * @returns the value when it is a string, otherwise an empty string
 */
function asText(value) {
  return typeof value === "string" ? value : "";
}

/*
 * @behavior Refuse a client without a real key, a pinned API version, and a transport, so a
 *           misconfigured deployment fails here instead of at the first sale.
 * @param secretKey — the Stripe secret key; it has to start with `sk_test_` or `sk_live_`
 * @param apiVersion — the pinned Stripe API version, e.g. `2026-08-27.basil`
 * @param fetchImpl — the function used to make the HTTP requests
 * @exceptions StripeProviderError when any of the three is missing or malformed
 */
function validateConfiguration({ secretKey, apiVersion, fetchImpl }) {
  if (!/^sk_(?:test|live)_.+$/u.test(secretKey ?? "")) failSafely("configuration");
  const versionMatch = /^(\d{4}-\d{2}-\d{2})\.[A-Za-z0-9-]+$/u.exec(apiVersion ?? "");
  if (!versionMatch) failSafely("configuration");
  const parsedDate = new Date(`${versionMatch[1]}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.valueOf()) || !parsedDate.toISOString().startsWith(versionMatch[1])) failSafely("configuration");
  if (typeof fetchImpl !== "function") failSafely("configuration");
}

/*
 * @behavior Check that metadata is a plain object whose keys and values are all non-empty strings,
 *           which is the only shape Stripe accepts.
 * @param metadata — the metadata to check
 * @exceptions StripeProviderError when metadata is not an object, or a key or value is not a
 *             non-empty string
 */
function validateMetadata(metadata) {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) failSafely("invalid_request");
  for (const [key, value] of Object.entries(metadata)) {
    if (!isNonEmptyString(key) || !isNonEmptyString(value)) failSafely("invalid_request");
  }
}

/*
 * @behavior Check the stored purchase before it leaves the process. Every value was decided
 *           earlier and stored, so a failure means the record is damaged.
 * @param frozenStripeRequest — the stored purchase: line items with their prices and quantities,
 *                              the return URLs, the expiry, and the attempt and order ids
 * @exceptions StripeProviderError when a line item, URL, expiry, or metadata value is unusable
 */
function validateFrozenRequest(frozenStripeRequest) {
  if (frozenStripeRequest === null || typeof frozenStripeRequest !== "object" || Array.isArray(frozenStripeRequest)) failSafely("invalid_request");
  const {
    lineItems,
    successUrl,
    cancelUrl,
    expiresAt,
    clientReferenceId,
    metadata,
  } = frozenStripeRequest;
  if (!Array.isArray(lineItems) || lineItems.length === 0) failSafely("invalid_request");
  for (const item of lineItems) {
    if (item === null || typeof item !== "object" || Array.isArray(item)
      || !isNonEmptyString(item.priceId)
      || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) failSafely("invalid_request");
  }
  if (!isNonEmptyString(successUrl) || !isNonEmptyString(cancelUrl)
    || !isEpochSeconds(expiresAt) || !isNonEmptyString(clientReferenceId)) failSafely("invalid_request");
  validateMetadata(metadata);
}

/*
 * @behavior Translate Stripe's payload into the five facts the checkout flow uses.
 * @param payload — a raw Stripe Checkout Session object
 * @returns the session as { id, url, expiresAt, paymentIntentId, status }
 * @exceptions StripeProviderError when the payload lacks an id, a payment URL, a status, an
 *             expiry, or carries a PaymentIntent value that is neither a string nor null
 */
function normalizeStripeSession(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)
    || !isNonEmptyString(payload.id)
    || !isNonEmptyString(payload.url)
    || !isNonEmptyString(payload.status)
    || !isEpochSeconds(payload.expires_at)
    || (payload.payment_intent !== null && !isNonEmptyString(payload.payment_intent))) failSafely("invalid_response");
  return {
    id: payload.id,
    url: payload.url,
    expiresAt: payload.expires_at,
    paymentIntentId: payload.payment_intent,
    status: payload.status,
  };
}

/*
 * @behavior Copy the metadata Stripe sent, or report that it sent none.
 * @param metadata — the metadata from a Stripe object; most objects carry none
 * @returns a copy of the metadata, or null when there is none to copy
 * @exceptions StripeProviderError when metadata is present but is not an object
 */
function normalizeMetadataOrNull(metadata) {
  if (metadata === null || metadata === undefined) return null;
  if (typeof metadata !== "object" || Array.isArray(metadata)) failSafely("invalid_response");
  return { ...metadata };
}

/*
 * @behavior Describe one authenticated read of a Checkout Session in the terms the payment
 *           decision is made in. Recording what we saw is not the same as judging it: an open or
 *           unpaid Session is reported faithfully, so the decision can refuse it with a reason.
 * @param payload — the raw Session object Stripe returned
 * @param context.accountId — the account we asked about, recorded because a direct Stripe account
 *        omits itself from the payload
 * @param context.observedAt — when we made this read
 * @param context.keyMode — test or live, taken from the key; a Session whose livemode disagrees
 *        with the key cannot be about our account, so it is refused rather than recorded
 * @returns the session as the facts a payment decision compares against: its ids, source, status,
 *          mode, currency, total in cents, payment intent, and metadata
 * @exceptions StripeProviderError when the Session is structurally damaged, or its mode disagrees
 *             with the key
 */
function normalizePaymentEvidenceSession(payload, { accountId, observedAt, keyMode } = {}) {
  if (!isNonEmptyString(accountId) || !Number.isSafeInteger(observedAt) || !isNonEmptyString(keyMode)) failSafely("invalid_response");
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)
    || !isNonEmptyString(payload.id)
    || !isWholeCents(payload.amount_total)
    || typeof payload.livemode !== "boolean") failSafely("invalid_response");
  if (payload.livemode !== (keyMode === "live")) failSafely("invalid_response");
  const paymentIntentId = payload.payment_intent === undefined || payload.payment_intent === null
    ? null
    : payload.payment_intent;
  if (paymentIntentId !== null && !isNonEmptyString(paymentIntentId)) failSafely("invalid_response");
  return {
    source: AUTHENTICATED_SERVER_RETRIEVAL,
    observedAt,
    accountId,
    livemode: payload.livemode,
    objectType: "checkout.session",
    objectId: payload.id,
    mode: asText(payload.mode),
    status: asText(payload.status),
    paymentStatus: asText(payload.payment_status),
    currency: asText(payload.currency),
    amountTotalCents: payload.amount_total,
    paymentIntentId,
    metadata: normalizeMetadataOrNull(payload.metadata),
  };
}

/*
 * @behavior Describe one authenticated read of the PaymentIntent behind a purchase. The Session
 *           is the link back to the attempt, so the caller supplies that correlation from stored
 *           data; nothing about which order this belongs to can come from Stripe.
 * @param payload — the PaymentIntent object Stripe returned
 * @param context.accountId — the account we asked about, recorded in the result
 * @param context.observedAt — when we made this read
 * @param context.keyMode — test or live, taken from the key; a PaymentIntent from the other mode
 *        cannot be about our account
 * @param context.sessionId — the checkout session this payment belongs to, supplied from our own
 *        stored data, because nothing in the PaymentIntent says which order it is for
 * @returns the payment intent as { source, observedAt, accountId, livemode, objectType, objectId,
 *          status, amountCents, currency, sessionId, metadata }
 * @exceptions StripeProviderError when the PaymentIntent is structurally damaged, is not for the
 *             account the key opens, or the caller supplied no Session to attach it to
 */
function normalizePaymentIntentEvidence(payload, { accountId, observedAt, keyMode, sessionId } = {}) {
  if (!isNonEmptyString(accountId) || !Number.isSafeInteger(observedAt) || !isNonEmptyString(keyMode) || !isNonEmptyString(sessionId)) failSafely("invalid_response");
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)
    || !isNonEmptyString(payload.id)
    || !isNonEmptyString(payload.status)
    || !isWholeCents(payload.amount)
    || typeof payload.livemode !== "boolean") failSafely("invalid_response");
  if (payload.livemode !== (keyMode === "live")) failSafely("invalid_response");
  return {
    source: AUTHENTICATED_SERVER_RETRIEVAL,
    observedAt,
    accountId,
    livemode: payload.livemode,
    objectType: "payment_intent",
    objectId: payload.id,
    status: payload.status,
    amountCents: payload.amount,
    currency: asText(payload.currency),
    sessionId,
    metadata: normalizeMetadataOrNull(payload.metadata),
  };
}

/*
 * @behavior Build the client the checkout flow uses: create one hosted Checkout Session for
 *           a stored purchase, and read a Session back to check its link is still usable.
 * @param options.secretKey — the Stripe key: `sk_test_…` for test mode, `sk_live_…` for real
 * @param options.apiVersion — the pinned Stripe API version, e.g. 2026-08-27.basil
 * @param options.fetchImpl — the HTTP transport, injected so tests run without Stripe
 * @param options.now — the clock, injected so evidence can be stamped with a test time
 * @returns a client whose methods never throw anything but StripeProviderError
 * @exceptions StripeProviderError when the configuration is unusable
 */
export function createStripeProviderClient(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) failSafely("configuration");
  const { secretKey, apiVersion, fetchImpl, now } = options;
  validateConfiguration({ secretKey, apiVersion, fetchImpl });
  if (now !== undefined && typeof now !== "function") failSafely("configuration");
  const readClock = now ?? Date.now;
  const keyMode = secretKey.startsWith("sk_live_") ? "live" : "test";
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Stripe-Version": apiVersion,
  };

  /*
   * @behavior Call Stripe once and hand back the parsed body, or fail safely.
   * @param url — the full Stripe URL to call
   * @param init — the fetch options: method, headers, and body
   * @returns the parsed payload, in whatever shape that Stripe resource uses
   * @exceptions StripeProviderError when the request fails, Stripe rejects it, or the body cannot
   *             be parsed
   *
   * A rejected body is never read: it can repeat our key or the buyer's payment details.
   */
  async function readPayload(url, init) {
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      failSafely("transport");
    }
    if (response === null || typeof response !== "object" || response.ok !== true) failSafely("provider_rejection");
    try {
      return await response.json();
    } catch {
      failSafely("invalid_response");
    }
  }

  return {
    /*
     * @behavior Create a Stripe Checkout Session for a stored purchase and return the link to
     *           Stripe's hosted payment page. Retries reuse the same key, so Stripe can tell a
     *           retry apart from a second purchase.
     * @param options.frozenStripeRequest — the stored purchase: line items with their prices
     *        and quantities, the return URLs, the expiry, and the attempt and order ids
     * @param options.idempotencyKey — our server-made key, `iuga:checkout:<attemptId>`
     * @returns the created Session: id, hosted payment URL, expiry, PaymentIntent, status
     * @exceptions StripeProviderError on a damaged request, a transport failure, or a response
     *             we cannot trust
     */
    async createCheckoutSession(options = {}) {
      if (options === null || typeof options !== "object" || Array.isArray(options)) failSafely("invalid_request");
      const { frozenStripeRequest, idempotencyKey } = options;
      if (!isNonEmptyString(idempotencyKey)) failSafely("invalid_request");
      validateFrozenRequest(frozenStripeRequest);
      const fields = new URLSearchParams();
      // One card payment, nothing saved: no payment method or quantity the buyer could change.
      fields.set("mode", "payment");
      fields.set("payment_method_types[0]", "card");
      fields.set("success_url", frozenStripeRequest.successUrl);
      fields.set("cancel_url", frozenStripeRequest.cancelUrl);
      // Stripe wants whole epoch seconds and refuses an expiry under 30 minutes or over 24 hours.
      fields.set("expires_at", String(frozenStripeRequest.expiresAt));
      fields.set("client_reference_id", frozenStripeRequest.clientReferenceId);
      frozenStripeRequest.lineItems.forEach((item, index) => {
        fields.set(`line_items[${index}][price]`, item.priceId);
        fields.set(`line_items[${index}][quantity]`, String(item.quantity));
      });
      // The ids go on the Session and the PaymentIntent: the payment webhook arrives as a
      // PaymentIntent event and must find the attempt it belongs to.
      for (const [key, value] of Object.entries(frozenStripeRequest.metadata)) {
        fields.set(`metadata[${key}]`, value);
        fields.set(`payment_intent_data[metadata][${key}]`, value);
      }
      // No promotion codes, quantity edits, or saved customers: the buyer cannot change the
      // price we set.
      return normalizeStripeSession(
        await readPayload(CHECKOUT_SESSIONS_URL, {
          method: "POST",
          headers: {
            ...headers,
            "Idempotency-Key": idempotencyKey,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: fields.toString(),
        }),
      );
    },
    /*
     * @behavior Read a Session we already created, to check whether its payment link is still
     *           open and unexpired before the buyer is sent back to it.
     * @param options.sessionId — Stripe's Session id, escaped into the URL path
     * @returns the same normalized shape as createCheckoutSession
     * @exceptions StripeProviderError on a transport failure or an untrustworthy response
     */
    async retrieveCheckoutSession(options = {}) {
      if (options === null || typeof options !== "object" || Array.isArray(options)) failSafely("invalid_request");
      const { sessionId } = options;
      if (!isNonEmptyString(sessionId)) failSafely("invalid_request");
      return normalizeStripeSession(
        await readPayload(`${CHECKOUT_SESSIONS_URL}/${encodeURIComponent(sessionId)}`, {
          method: "GET",
          headers,
        }),
      );
    },
    /*
     * @behavior Read a checkout session back from Stripe and describe it in the facts a payment
     *           decision is made on. This read is the only thing a payment may be judged on: the
     *           buyer returning to our page, and our own creation response, prove nothing.
     * @param options.sessionId — the session to read, escaped into the URL path
     * @param options.accountId — the account we expect it to belong to, recorded in the result
     * @returns the session as the facts a payment decision compares against, and when we read it
     * @exceptions StripeProviderError on a transport failure, an untrustworthy response, or a
     *             structurally damaged session
     */
    async retrievePaymentEvidence(options = {}) {
      if (options === null || typeof options !== "object" || Array.isArray(options)) failSafely("invalid_request");
      const { sessionId, accountId } = options;
      if (!isNonEmptyString(sessionId) || !isNonEmptyString(accountId)) failSafely("invalid_request");
      const payload = await readPayload(
        `${CHECKOUT_SESSIONS_URL}/${encodeURIComponent(sessionId)}`,
        { method: "GET", headers },
      );
      return normalizePaymentEvidenceSession(payload, {
        accountId,
        observedAt: readClock(),
        keyMode,
      });
    },
    /*
     * @behavior Read the PaymentIntent behind a purchase back from Stripe. This is a second
     *           opinion on a payment, never the verdict: only the session read can decide one.
     * @param options.paymentIntentId — the payment intent to read, escaped into the URL path
     * @param options.accountId — the account we expect it to belong to
     * @param options.sessionId — the checkout session it belongs to, supplied from our own stored
     *                            data
     * @returns the payment intent as the facts a payment decision compares against, including when
     *          we read it
     * @exceptions StripeProviderError on a transport failure, an untrustworthy response, a
     *             structurally damaged PaymentIntent, or no Session to attach it to
     */
    async retrievePaymentIntentEvidence(options = {}) {
      if (options === null || typeof options !== "object" || Array.isArray(options)) failSafely("invalid_request");
      const { paymentIntentId, accountId, sessionId } = options;
      if (!isNonEmptyString(paymentIntentId) || !isNonEmptyString(accountId) || !isNonEmptyString(sessionId)) failSafely("invalid_request");
      const payload = await readPayload(
        `${PAYMENT_INTENTS_URL}/${encodeURIComponent(paymentIntentId)}`,
        { method: "GET", headers },
      );
      return normalizePaymentIntentEvidence(payload, {
        accountId,
        observedAt: readClock(),
        keyMode,
        sessionId,
      });
    },
  };
}
