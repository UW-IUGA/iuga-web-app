/*
Purpose: The only place that talks to Stripe. It turns one already-priced purchase into a
         hosted Checkout Session the buyer can pay, and reads that Session back so the
         checkout flow can tell whether the payment link is still worth sending again.

Called by: checkoutCoordinator, which owns the buyer, the prices, and the retry key this
           file passes along unchanged.

Must not: decide money, quantities, or identity — those arrive already decided. Never let a
          Stripe error body, our API key, or an internal identifier reach a caller or a log.
*/

/*
 * Stripe's REST API speaks snake_case form fields, so this file is the single translation
 * point between our names and Stripe's: lineItems[].priceId -> line_items[0][price],
 * expiresAt -> expires_at, clientReferenceId -> client_reference_id.
 */
const CHECKOUT_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";

/*
Purpose: One safe failure type for every way this file can fail — unusable configuration, a
         dead network, a rejection from Stripe, or a response we cannot trust. Callers catch
         it and record "we do not know what Stripe did"; Stripe's own message can echo keys
         and payment details, so it never reaches them.
*/
class StripeProviderError extends Error {
  constructor() {
    super("Stripe provider request failed");
    this.name = "StripeProviderError";
  }
}

// Every validation below funnels into this, so no failed path can leak a reason to a caller.
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
Purpose: Refuse to build a client unless we have a real key, a pinned API version, and a
         transport, so a misconfigured deployment fails here instead of at the first sale.
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
Purpose: Check the locked-in purchase request before it leaves the process. Every value here
         was decided and stored earlier by checkoutCoordinator, so a failure means the stored
         record is damaged — we stop rather than send Stripe a half-valid order.
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
 * Purpose: Translate Stripe's payload into the five facts the checkout flow actually uses.
 * @exceptions StripeProviderError when the payload lacks an id, a payment URL, a status, an
 *             expiry, or carries a PaymentIntent value that is neither a string nor null.
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
 * Purpose: Read exactly one Stripe response, or fail safely.
 * Why: a rejected response body is never read — it can echo our key or the buyer's payment
 *      details, so we throw it away and report a generic failure instead.
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
 * Purpose: Build the client the checkout flow uses for two jobs — create one hosted Checkout
 *          Session for a locked-in purchase, and read a Session back to see whether its
 *          payment link is still usable.
 *
 * @param options.secretKey — the Stripe key: `sk_test_…` for test mode, `sk_live_…` for real.
 * @param options.apiVersion — the Stripe API version we pinned, e.g. 2026-08-27.basil.
 * @param options.fetchImpl — the HTTP transport, injected so tests run without Stripe.
 * @returns a client whose two methods never throw anything but StripeProviderError.
 * @exceptions StripeProviderError when the configuration is unusable.
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
     * Purpose: Create the payment page the buyer is sent to. Retries reuse the same retry key
     *          so Stripe can tell a retry apart from a second purchase.
     * @param options.frozenStripeRequest — the locked-in purchase: line items with their
     *        Stripe prices and quantities, the return URLs, the expiry, and the attempt/order
     *        ids we attach for later reconciliation.
     * @param options.idempotencyKey — our server-made key, `iuga:checkout:<attemptId>`.
     * @returns the created Session, normalized: id, payment URL, expiry, PaymentIntent, status.
     * @exceptions StripeProviderError on a damaged request, a transport failure, or any
     *             response we cannot trust.
     */
    async createCheckoutSession(options = {}) {
      if (options === null || typeof options !== "object" || Array.isArray(options)) failSafely();
      const { frozenStripeRequest, idempotencyKey } = options;
      if (!isNonEmptyString(idempotencyKey)) failSafely();
      validateFrozenRequest(frozenStripeRequest);
      const fields = new URLSearchParams();
      // One card payment, nothing saved: the buyer cannot pick a method or quantity we did
      // not price, and no customer record is requested from Stripe.
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
      // Why: the same ids go on the Session and on the PaymentIntent, because the later payment
      //      webhook arrives as a PaymentIntent event and must find the attempt it belongs to.
      for (const [key, value] of Object.entries(frozenStripeRequest.metadata)) {
        fields.set(`metadata[${key}]`, value);
        fields.set(`payment_intent_data[metadata][${key}]`, value);
      }
      // Why: promotion codes, quantity changes on Stripe's page, and saved-customer creation are
      //      deliberately not requested — the buyer must not be able to change what we priced.
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
     * Purpose: Read a Session we already created, to check whether its payment link is still
     *          open and unexpired before we hand it to the buyer again.
     * @param options.sessionId — Stripe's Session id, escaped into the URL path.
     * @returns the same normalized shape as createCheckoutSession.
     * @exceptions StripeProviderError on a transport failure or an untrustworthy response.
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
