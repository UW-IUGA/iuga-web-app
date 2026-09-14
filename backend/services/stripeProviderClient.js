/*
 * @behavior The only place that talks to Stripe: build a hosted Checkout Session from one
 *           already-priced purchase, and read a Session back to see whether its payment link
 *           is still usable. Money, quantities, and identity arrive decided. No Stripe error
 *           body, API key, or internal identifier ever reaches a caller or a log.
 */

const CHECKOUT_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";

/*
 * @behavior Turn every Stripe boundary failure — bad configuration, a dead network, a rejection,
 *           or an untrustworthy response — into one generic error. Stripe's own message can echo
 *           keys and payment details, so it never reaches the caller.
 */
class StripeProviderError extends Error {
  constructor() {
    super("Stripe provider request failed");
    this.name = "StripeProviderError";
  }
}

function failSafely() {
  throw new StripeProviderError();
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

// Stripe reports expiry as whole seconds since 1970 ("epoch seconds"), never milliseconds.
function isEpochSeconds(value) {
  return Number.isSafeInteger(value) && value > 0;
}

/*
 * @behavior Refuse a client without a real key, a pinned API version, and a transport, so a
 *           misconfigured deployment fails here instead of at the first sale.
 * @exceptions StripeProviderError when any of the three is missing or malformed
 */
function validateConfiguration({ secretKey, apiVersion, fetchImpl }) {
  if (!/^sk_(?:test|live)_.+$/u.test(secretKey ?? "")) failSafely();
  const versionMatch = /^(\d{4}-\d{2}-\d{2})\.[A-Za-z0-9-]+$/u.exec(apiVersion ?? "");
  if (!versionMatch) failSafely();
  const parsedDate = new Date(`${versionMatch[1]}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.valueOf()) || !parsedDate.toISOString().startsWith(versionMatch[1])) failSafely();
  if (typeof fetchImpl !== "function") failSafely();
}

function validateMetadata(metadata) {
  if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) failSafely();
  for (const [key, value] of Object.entries(metadata)) {
    if (!isNonEmptyString(key) || !isNonEmptyString(value)) failSafely();
  }
}

/*
 * @behavior Check the stored purchase before it leaves the process. Every value was decided
 *           earlier and stored, so a failure means the record is damaged.
 * @exceptions StripeProviderError when a line item, URL, expiry, or metadata value is unusable
 */
function validateFrozenRequest(frozenStripeRequest) {
  if (frozenStripeRequest === null || typeof frozenStripeRequest !== "object" || Array.isArray(frozenStripeRequest)) failSafely();
  const {
    lineItems,
    successUrl,
    cancelUrl,
    expiresAt,
    clientReferenceId,
    metadata,
  } = frozenStripeRequest;
  if (!Array.isArray(lineItems) || lineItems.length === 0) failSafely();
  for (const item of lineItems) {
    if (item === null || typeof item !== "object" || Array.isArray(item)
      || !isNonEmptyString(item.priceId)
      || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) failSafely();
  }
  if (!isNonEmptyString(successUrl) || !isNonEmptyString(cancelUrl)
    || !isEpochSeconds(expiresAt) || !isNonEmptyString(clientReferenceId)) failSafely();
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
    || (payload.payment_intent !== null && !isNonEmptyString(payload.payment_intent))) failSafely();
  return {
    id: payload.id,
    url: payload.url,
    expiresAt: payload.expires_at,
    paymentIntentId: payload.payment_intent,
    status: payload.status,
  };
}

/*
 * @behavior Read exactly one Stripe response, or fail safely.
 * @param response — the transport response for one Stripe request
 * @returns the normalized session from normalizeStripeSession
 * @exceptions StripeProviderError when the response failed or its body cannot be parsed
 *
 * A rejected body is never read: it can echo our key or the buyer's payment details.
 */
async function readStripeSessionResponse(response) {
  if (response === null || typeof response !== "object" || response.ok !== true) failSafely();
  let payload;
  try {
    payload = await response.json();
  } catch {
    failSafely();
  }
  return normalizeStripeSession(payload);
}

/*
 * @behavior Build the client the checkout flow uses: create one hosted Checkout Session for
 *           a stored purchase, and read a Session back to check its link is still usable.
 * @param options.secretKey — the Stripe key: `sk_test_…` for test mode, `sk_live_…` for real
 * @param options.apiVersion — the pinned Stripe API version, e.g. 2026-08-27.basil
 * @param options.fetchImpl — the HTTP transport, injected so tests run without Stripe
 * @returns a client whose two methods never throw anything but StripeProviderError
 * @exceptions StripeProviderError when the configuration is unusable
 */
export function createStripeProviderClient(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) failSafely();
  const { secretKey, apiVersion, fetchImpl } = options;
  validateConfiguration({ secretKey, apiVersion, fetchImpl });
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    "Stripe-Version": apiVersion,
  };

  async function request(url, init) {
    let response;
    try {
      response = await fetchImpl(url, init);
    } catch {
      failSafely();
    }
    return readStripeSessionResponse(response);
  }

  return {
    /*
     * @behavior Create the page the buyer pays on. Retries reuse the same key, so Stripe can
     *           tell a retry apart from a second purchase.
     * @param options.frozenStripeRequest — the stored purchase: line items with their prices
     *        and quantities, the return URLs, the expiry, and the attempt and order ids
     * @param options.idempotencyKey — our server-made key, `iuga:checkout:<attemptId>`
     * @returns the created Session: id, payment URL, expiry, PaymentIntent, status
     * @exceptions StripeProviderError on a damaged request, a transport failure, or a response
     *             we cannot trust
     */
    async createCheckoutSession(options = {}) {
      if (options === null || typeof options !== "object" || Array.isArray(options)) failSafely();
      const { frozenStripeRequest, idempotencyKey } = options;
      if (!isNonEmptyString(idempotencyKey)) failSafely();
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
      return request(CHECKOUT_SESSIONS_URL, {
        method: "POST",
        headers: {
          ...headers,
          "Idempotency-Key": idempotencyKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: fields.toString(),
      });
    },
    /*
     * @behavior Read a Session we already created, to check whether its payment link is still
     *           open and unexpired before the buyer is sent back to it.
     * @param options.sessionId — Stripe's Session id, escaped into the URL path
     * @returns the same normalized shape as createCheckoutSession
     * @exceptions StripeProviderError on a transport failure or an untrustworthy response
     */
    async retrieveCheckoutSession(options = {}) {
      if (options === null || typeof options !== "object" || Array.isArray(options)) failSafely();
      const { sessionId } = options;
      if (!isNonEmptyString(sessionId)) failSafely();
      return request(`${CHECKOUT_SESSIONS_URL}/${encodeURIComponent(sessionId)}`, {
        method: "GET",
        headers,
      });
    },
  };
}
