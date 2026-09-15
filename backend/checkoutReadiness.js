/*
 * @behavior Answer whether checkout may run, from configuration, infrastructure, and policy
 *           alone — without contacting Stripe. Anything missing leaves checkout switched off,
 *           and the reasons name what is missing without revealing its value.
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

function readPaymentMethods(value) {
  if (Array.isArray(value)) return value.map(text);
  if (typeof value === "string") return value.split(",").map(text);
  return [];
}

// The floor arrives as a digit string from env vars, but as a number from tests and callers.
function readMinimumTotalCents(value) {
  const amount = typeof value === "string" ? value.trim() : value;
  const total = typeof amount === "string"
    ? (/^\d+$/u.test(amount) ? Number(amount) : Number.NaN)
    : amount;

  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

function validPinnedApiVersion(value) {
  const match = /^(\d{4}-\d{2}-\d{2})\.[A-Za-z0-9-]+$/.exec(text(value));
  if (!match) return false;

  const parsedDate = new Date(`${match[1]}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.valueOf())
    && parsedDate.toISOString().startsWith(match[1]);
}

function credentialsMatchMode(mode, secretKey) {
  const key = text(secretKey);
  if (mode === "test") return /^sk_test_.+$/u.test(key);
  if (mode === "live") return /^sk_live_.+$/u.test(key);
  return false;
}

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

function safeBaseUrl(value) {
  try {
    const url = new URL(text(value));
    if (!validHttpsBaseUrl(value)) return "[redacted]";
    return url.origin;
  } catch {
    return "[redacted]";
  }
}

/*
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
