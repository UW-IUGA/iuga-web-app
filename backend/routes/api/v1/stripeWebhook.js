/*
Purpose: Receive the signed Stripe webhook deliveries that tell IUGA what happened to a payment.

Expected Request Information:
- POST with the exact Stripe event JSON and a `stripe-signature` header of the form
  `t=<unix seconds>,v1=<hex hmac>`. Several `v1` values appear while an endpoint secret rotates.
- The event's account and livemode match this deployment, and its API version matches the pinned one.

Expected Response Information:
- 200 with an empty body once the delivery is stored in ReceivedStripeEvent, including for a
  duplicate delivery.
- 400 with a safe error for a delivery that fails verification or uses an unsupported event shape.
*/

import crypto from "node:crypto";
import express from "express";
import { sendError } from "./helpers/sendError.js";

/*
 * A Stripe event we accept is a few kilobytes. Bounding the webhook separately from the JSON API
 * keeps a large unauthenticated body from being buffered before the signature is checked.
 */
const WEBHOOK_BODY_LIMIT = "256kb";

/*
 * Stripe's documented default replay window. A delivery older or newer than this is refused rather
 * than stored, so a captured delivery cannot be replayed against us later.
 */
const SIGNATURE_TOLERANCE_SECONDS = 300;

const PINNED_API_VERSION = /^\d{4}-\d{2}-\d{2}\.[A-Za-z0-9-]+$/u;
const HEX_DIGEST = /^[0-9a-f]+$/u;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/*
 * @behavior Read the four Stripe endpoint settings this route needs from the environment.
 * @param env — the process environment; a setting that is missing or not a string comes back as an
 *              empty string
 * @returns the webhook secret, the account id, the mode (`test` or `live`, lowercased), and the
 *          pinned API version
 */
function readConfiguration(env) {
  const source = env ?? {};
  return {
    secret: text(source.STRIPE_WEBHOOK_SECRET),
    accountId: text(source.STRIPE_ACCOUNT_ID),
    mode: text(source.STRIPE_MODE).toLowerCase(),
    apiVersion: text(source.STRIPE_API_VERSION),
  };
}

/*
 * @behavior Decide whether the endpoint settings are complete enough to accept a delivery at all.
 * @param configuration — the settings returned by readConfiguration
 * @returns true when the secret, account id, mode, and API version are all present and well formed
 */
function isUsableConfiguration({ secret, accountId, mode, apiVersion }) {
  return secret.length > 0
    && accountId.length > 0
    && (mode === "test" || mode === "live")
    && PINNED_API_VERSION.test(apiVersion);
}

/*
 * @behavior Split a `stripe-signature` header into its timestamp and its signature values.
 * @param header — the raw header value, e.g. `t=1700000000,v1=<hex>`; Stripe sends one `v1` value
 *                 per active endpoint secret
 * @returns the timestamp in seconds, or null when the header carries no usable `t` value, plus
 *          every `v1` value found
 */
function readSignatureHeader(header) {
  const timestamp = { value: null };
  const signatures = [];
  if (typeof header !== "string" || header.length === 0) {
    return { timestamp: timestamp.value, signatures };
  }

  for (const part of header.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name === "t" && /^\d+$/u.test(value)) timestamp.value = Number(value);
    else if (name === "v1") signatures.push(value);
  }

  return { timestamp: timestamp.value, signatures };
}

/*
 * @behavior Compare the signature we computed against each signature Stripe sent, in constant
 *           time, so a wrong signature reveals nothing about how much of it was right.
 * @param expectedHex — the hex signature computed from the request body
 * @param candidates — the hex signatures Stripe sent in the header
 * @returns true when one candidate matches exactly, false when none does
 */
function matchesAnySignature(expectedHex, candidates) {
  const expected = Buffer.from(expectedHex, "hex");
  return candidates.some((candidate) => {
    if (candidate.length !== expectedHex.length || !HEX_DIGEST.test(candidate)) return false;
    return crypto.timingSafeEqual(Buffer.from(candidate, "hex"), expected);
  });
}

/*
 * @behavior Decide whether this delivery really came from Stripe, unmodified, and recently enough
 *           to act on. The signature covers the exact bytes received, so the body is hashed as a
 *           Buffer and never re-encoded.
 * @param body — the raw request body as a Buffer
 * @param header — the `stripe-signature` header value
 * @param secret — the endpoint secret Stripe signs with
 * @param now — the current time in milliseconds
 * @returns true when one signature matches and the timestamp is inside the replay window
 */
function verifySignature({ body, header, secret, now }) {
  const { timestamp, signatures } = readSignatureHeader(header);
  if (timestamp === null || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(now / 1000) - timestamp);
  if (age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest("hex");

  return matchesAnySignature(expected, signatures);
}

/*
 * @behavior Turn a verified Stripe event into the small record we store: the fields that spot a
 *           duplicate delivery, plus which event this is. Everything else in the payload — the raw
 *           body, the object data, any secret — is deliberately dropped.
 * @param payload — the parsed Stripe event
 * @param configuration — the settings the event has to match: our account, our mode, our pinned
 *                        API version
 * @returns the record to store, or null when the event is not one this endpoint accepts
 */
function normalizeEvent(payload, configuration) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;

  const eventId = text(payload.id);
  const eventType = text(payload.type);
  const apiVersion = text(payload.api_version);
  const account = payload.account === undefined || payload.account === null
    ? ""
    : text(payload.account);

  if (eventId.length === 0 || eventType.length === 0 || apiVersion.length === 0) return null;
  if (typeof payload.livemode !== "boolean") return null;
  // For a direct account Stripe omits `account`; when it is present it must be ours.
  if (account.length > 0 && account !== configuration.accountId) return null;
  if (payload.livemode !== (configuration.mode === "live")) return null;
  if (apiVersion !== configuration.apiVersion) return null;

  return {
    accountId: configuration.accountId,
    livemode: payload.livemode,
    eventId,
    eventType,
    apiVersion,
  };
}

function isDuplicateKeyError(error) {
  return error !== null && typeof error === "object" && error.code === 11000;
}

/*
 * @behavior Build the route that reads the raw Stripe bytes, verifies the signature, and stores
 *           the event before answering 200.
 * @param options.models — the registered Mongoose models; only ReceivedStripeEvent is used
 * @param options.env — the process environment, injected so tests need no real secrets
 * @returns the Express router, which the app mounts at /api/v1/stripe/webhook
 */
export function createStripeWebhookRouter({ models, env } = {}) {
  const configuration = readConfiguration(env);
  const readRawBody = express.raw({ type: "application/json", limit: WEBHOOK_BODY_LIMIT });
  const router = express.Router();

  /*
   * @behavior Read the request body into a Buffer before anything else touches it.
   * @param req — the Express request
   * @param res — the Express response
   * @param next — continues to the handler when the body was read
   * @returns nothing; sends 400 and stops when the body cannot be read in full, which an oversized
   *          delivery never can be
   */
  function captureRawBody(req, res, next) {
    readRawBody(req, res, (error) => {
      if (error) {
        sendError(res, 400, "Invalid webhook payload");
        return;
      }
      next();
    });
  }

  /*
   * @behavior Accept one Stripe delivery: check the settings, verify the signature against the raw
   *           bytes, reject an event we do not handle, and store the rest. A delivery we already
   *           hold is acknowledged without a second write.
   * @param req — the Express request, with the raw body from captureRawBody
   * @param res — the Express response
   * @param next — passes an unexpected database error to the app's error handler
   * @returns nothing; answers 200 with an empty body once the event is stored, or 400 with a short
   *          message when the settings, the body, the signature, or the event shape is unusable
   */
  router.post("/", captureRawBody, async (req, res, next) => {
    if (!isUsableConfiguration(configuration)) {
      sendError(res, 400, "Webhook endpoint is not configured");
      return;
    }

    // A non-Buffer body means another parser consumed the stream first, so the bytes the signature
    // covers are already gone. Refuse rather than trust a parsed object.
    if (!Buffer.isBuffer(req.body)) {
      sendError(res, 400, "Invalid webhook payload");
      return;
    }

    const verified = verifySignature({
      body: req.body,
      header: req.headers["stripe-signature"],
      secret: configuration.secret,
      now: Date.now(),
    });
    if (!verified) {
      sendError(res, 400, "Invalid webhook signature");
      return;
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      sendError(res, 400, "Invalid webhook payload");
      return;
    }

    const observation = normalizeEvent(payload, configuration);
    if (observation === null) {
      sendError(res, 400, "Unsupported webhook event");
      return;
    }

    try {
      await models.ReceivedStripeEvent.create(observation);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        // We already hold this delivery. Stripe retries on any non-2xx, so acknowledge instead of
        // failing, and write nothing a second time.
        res.status(200).end();
        return;
      }
      next(error);
      return;
    }

    res.status(200).end();
  });

  return router;
}
