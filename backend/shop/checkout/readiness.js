/*
Purpose: Evaluate whether checkout is permitted to run, based on configuration, infrastructure, and policy gates.
Authentication/Authorization Requirements: None. Callable by health checks, administrative endpoints, and the shop router.
Expected Request Information:
- An input object containing env, infrastructure, and policy dictionaries.
Expected Response Information:
- A readiness evaluation: checkoutEnabled (boolean), mode, reasons (array of failure codes), and safe diagnostics.
*/

const REQUIRED_CONFIGURATION = Object.freeze([
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_API_VERSION",
  "STRIPE_BASE_URL",
  "STRIPE_CATALOG_VERSION",
]);

const REQUIRED_INFRASTRUCTURE_FLAGS = Object.freeze([
  "databaseTransactions",
  "sessionStore",
  "worker",
]);

// gateA and gateB were never recorded anywhere. Keep their names; do not invent meanings.
const REQUIRED_BUSINESS_APPROVALS = Object.freeze([
  "identity",
  "csrf",
  "tax",
  "fulfillment",
  "gateA",
  "gateB",
]);

function asRecord(value) {
  return value !== null && typeof value === "object" ? value : {};
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasValue(value) {
  return text(value).length > 0;
}

function isEnabledFlag(value) {
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

/**
 * @behavior Parse configured payment methods from an array or comma-separated string into a list of trimmed strings.
 * @param value — the payment methods setting, either an array or comma-separated string
 * @returns a list of trimmed payment method strings, or an empty list when missing or not a recognized type
 */
function readPaymentMethods(value) {
  if (Array.isArray(value)) return value.map(text);
  if (typeof value === "string") return value.split(",").map(text);
  return [];
}

// The floor arrives as a digit string from env vars, but as a number from tests and callers.
/**
 * @behavior Parse a minimum checkout total in cents from a string or number, rejecting zero, negative, or fractional values.
 * @param value — the minimum total in cents as a digit string or positive integer
 * @returns the positive integer total in cents, or null if the value is missing, non-numeric, or not positive
 */
function readMinimumTotalCents(value) {
  const amount = typeof value === "string" ? value.trim() : value;
  const total = typeof amount === "string"
    ? (/^\d+$/u.test(amount) ? Number(amount) : Number.NaN)
    : amount;

  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

/**
 * @behavior Check whether a Stripe API version string has the format YYYY-MM-DD.<subversion> and represents a real calendar date.
 * @param value — the API version string to validate
 * @returns true if the string is a valid pinned Stripe API version; false otherwise
 */
function validPinnedApiVersion(value) {
  const match = /^(\d{4}-\d{2}-\d{2})\.[A-Za-z0-9-]+$/.exec(text(value));
  if (!match) return false;

  const parsedDate = new Date(`${match[1]}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.valueOf())
    && parsedDate.toISOString().startsWith(match[1]);
}

/**
 * @behavior Check whether the Stripe secret key prefix matches the configured operating mode ("test" or "live").
 * @param mode — the configured operating mode ("test" or "live")
 * @param secretKey — the Stripe secret key from configuration
 * @returns true when the secret key prefix matches the mode; false otherwise
 */
function credentialsMatchMode(mode, secretKey) {
  const key = text(secretKey);
  if (mode === "test") return /^sk_test_.+$/u.test(key);
  if (mode === "live") return /^sk_live_.+$/u.test(key);
  return false;
}

/**
 * @behavior Verify that a base URL is an absolute HTTPS origin with a hostname and no credentials, path, query, or hash.
 * @param value — the URL string to validate
 * @returns true if the value is a clean HTTPS origin; false otherwise
 */
function validHttpsBaseUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && Boolean(url.hostname)
      && url.pathname === "/"
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

/**
 * @behavior Return the sanitized URL origin for diagnostics, or "[redacted]" if the URL is invalid or malformed.
 * @param value — the URL string to sanitize
 * @returns the origin string if valid, or "[redacted]"
 */
function safeBaseUrl(value) {
  try {
    const url = new URL(text(value));
    if (!validHttpsBaseUrl(value)) return "[redacted]";
    return url.origin;
  } catch {
    return "[redacted]";
  }
}

const LOCAL_MACHINE_HOSTNAMES = Object.freeze(["localhost", "[::1]", "::1", "0.0.0.0"]);

function isReachableOnlyFromThisMachine(value) {
  try {
    const hostname = new URL(text(value)).hostname.toLowerCase();
    return LOCAL_MACHINE_HOSTNAMES.includes(hostname)
      || hostname.endsWith(".localhost")
      || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(hostname);
  } catch {
    return false;
  }
}

/**
 * @behavior Answer whether checkout may run, and name every missing piece when it may not.
 * @param input — the deployment's configuration, infrastructure flags, and club approvals
 * @returns whether checkout is enabled, the mode it would run in, the reasons it is disabled,
 *          and diagnostics safe to show (keys and secrets are redacted)
 */
export function evaluateCheckoutReadiness(input = {}) {
  const source = asRecord(input);
  const env = asRecord(source.env);
  const infrastructure = asRecord(source.infrastructure);
  const policy = asRecord(source.policy);
  const reasons = new Set();

  const mode = text(env.STRIPE_MODE).toLowerCase();
  const missingConfiguration = REQUIRED_CONFIGURATION.some((key) => !hasValue(env[key]));
  if (missingConfiguration) reasons.add("missing_configuration");
  if (mode !== "test" && mode !== "live") reasons.add("invalid_mode");

  if (!credentialsMatchMode(mode, env.STRIPE_SECRET_KEY)) {
    reasons.add("mode_credentials_mismatch");
  }
  if (!validPinnedApiVersion(env.STRIPE_API_VERSION)) reasons.add("invalid_api_version");
  if (!validHttpsBaseUrl(env.STRIPE_BASE_URL)) reasons.add("invalid_base_url");

  const paymentMethods = readPaymentMethods(env.STRIPE_PAYMENT_METHODS);
  if (paymentMethods.length !== 1 || paymentMethods[0].toLowerCase() !== "card") {
    reasons.add("card_only_required");
  }

  if (text(env.STRIPE_CURRENCY).toLowerCase() !== "usd") reasons.add("usd_required");
  if (readMinimumTotalCents(env.STRIPE_MINIMUM_TOTAL_CENTS) === null) {
    reasons.add("positive_total_required");
  }

  if (!REQUIRED_INFRASTRUCTURE_FLAGS.every((gate) => isEnabledFlag(infrastructure[gate]))) {
    reasons.add("infrastructure_unhealthy");
  }

  if (!REQUIRED_BUSINESS_APPROVALS.every((gate) => isEnabledFlag(policy[gate]))) {
    reasons.add("policy_unapproved");
  }

  if (mode === "live" && !isEnabledFlag(policy.livePayments)) {
    reasons.add("live_mode_disabled");
  }

  if (mode === "live" && isReachableOnlyFromThisMachine(env.STRIPE_BASE_URL)) {
    reasons.add("base_url_not_public");
  }

  const diagnostics = {
    mode: mode || "[missing]",
    secretKey: hasValue(env.STRIPE_SECRET_KEY) ? "[redacted]" : "[missing]",
    webhookSecret: hasValue(env.STRIPE_WEBHOOK_SECRET) ? "[redacted]" : "[missing]",
    apiVersion: text(env.STRIPE_API_VERSION) || "[missing]",
    baseUrl: safeBaseUrl(env.STRIPE_BASE_URL),
    catalogVersion: text(env.STRIPE_CATALOG_VERSION) || "[missing]",
    paymentMethods,
    currency: text(env.STRIPE_CURRENCY).toLowerCase() || "[missing]",
    minimumTotalCents: readMinimumTotalCents(env.STRIPE_MINIMUM_TOTAL_CENTS) ?? "[invalid]",
  };

  return {
    checkoutEnabled: reasons.size === 0,
    mode,
    reasons: [...reasons],
    diagnostics,
  };
}
