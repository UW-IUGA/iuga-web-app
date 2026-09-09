const REQUIRED_CONFIGURATION = Object.freeze([
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_API_VERSION",
  "STRIPE_BASE_URL",
  "STRIPE_CATALOG_VERSION",
]);

const INFRASTRUCTURE_GATES = Object.freeze([
  "databaseTransactions",
  "sessionStore",
  "worker",
]);

const POLICY_GATES = Object.freeze([
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

function explicitlyTrue(value) {
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function readPaymentMethods(value) {
  if (Array.isArray(value)) return value.map(text);
  if (typeof value === "string") return value.split(",").map(text);
  return [];
}

function readPositiveTotal(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string" || !/^\d+$/u.test(value.trim())) return null;

  const total = Number(value);
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

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

/**
 * @behavior Evaluate explicit checkout prerequisites without contacting Stripe.
 * @param input — configuration plus infrastructure and policy evidence gates
 * @returns a fail-closed capability state with redacted diagnostics
 */
export function evaluateCheckoutReadiness(input = {}) {
  const source = asRecord(input);
  const env = asRecord(source.env);
  const infrastructure = asRecord(source.infrastructure);
  const policy = asRecord(source.policy);
  const reasons = [];

  const mode = text(env.STRIPE_MODE).toLowerCase();
  const missingConfiguration = REQUIRED_CONFIGURATION.some((key) => !hasValue(env[key]));
  if (missingConfiguration) addReason(reasons, "missing_configuration");
  if (mode !== "test" && mode !== "live") addReason(reasons, "invalid_mode");

  if (!credentialsMatchMode(mode, env.STRIPE_SECRET_KEY)) {
    addReason(reasons, "mode_credentials_mismatch");
  }
  if (!validPinnedApiVersion(env.STRIPE_API_VERSION)) addReason(reasons, "invalid_api_version");
  if (!validHttpsBaseUrl(env.STRIPE_BASE_URL)) addReason(reasons, "invalid_base_url");

  const paymentMethods = readPaymentMethods(env.STRIPE_PAYMENT_METHODS);
  if (paymentMethods.length !== 1 || paymentMethods[0].toLowerCase() !== "card") {
    addReason(reasons, "card_only_required");
  }
  if (text(env.STRIPE_CURRENCY).toLowerCase() !== "usd") addReason(reasons, "usd_required");
  if (readPositiveTotal(env.STRIPE_MINIMUM_TOTAL_MINOR) === null) {
    addReason(reasons, "positive_total_required");
  }

  if (!INFRASTRUCTURE_GATES.every((gate) => explicitlyTrue(infrastructure[gate]))) {
    addReason(reasons, "infrastructure_unhealthy");
  }
  if (!POLICY_GATES.every((gate) => explicitlyTrue(policy[gate]))) {
    addReason(reasons, "policy_unapproved");
  }
  if (mode === "live" && !explicitlyTrue(policy.livePayments)) {
    addReason(reasons, "live_mode_disabled");
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
    minimumTotalMinor: readPositiveTotal(env.STRIPE_MINIMUM_TOTAL_MINOR) ?? "[invalid]",
  };

  const available = reasons.length === 0;
  return {
    available,
    checkoutEnabled: available,
    mode,
    reasons,
    diagnostics,
  };
}
