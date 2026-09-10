import { createRemoteJWKSet, jwtVerify } from "jose";

const REQUIRED_ENV = [
  "ENTRA_TENANT_ID",
  "ENTRA_API_AUDIENCE",
  "ENTRA_REQUIRED_SCOPE",
  "ENTRA_REQUIRED_ROLE",
  "ENTRA_AUTHORIZED_CLIENT_ID",
];
const GUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const GUID_RE = new RegExp(`^${GUID_PATTERN}$`, "i");
const ENTRA_LOGIN_HOST = "login.microsoftonline.com";
const SAFE_CLAIM_VALUE_RE = /^[A-Za-z0-9_]+$/;
const AUDIENCE_RE = new RegExp(`^(?:${GUID_PATTERN}|api://${GUID_PATTERN})$`, "i");
const jwksByUri = new Map();

export class EntraTokenError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EntraTokenError";
    this.code = code;
  }
}

function configuredAuth() {
  const values = Object.fromEntries(
    REQUIRED_ENV.map((name) => [name, process.env[name]?.trim()]),
  );
  if (REQUIRED_ENV.some((name) => !values[name])) {
    throw new EntraTokenError("configuration", "Entra authentication is not configured");
  }
  if (!GUID_RE.test(values.ENTRA_TENANT_ID)) {
    throw new EntraTokenError("configuration", "Entra tenant configuration is invalid");
  }
  if (!AUDIENCE_RE.test(values.ENTRA_API_AUDIENCE)) {
    throw new EntraTokenError("configuration", "Entra audience configuration is invalid");
  }
  if (
    !GUID_RE.test(values.ENTRA_AUTHORIZED_CLIENT_ID) ||
    !SAFE_CLAIM_VALUE_RE.test(values.ENTRA_REQUIRED_SCOPE) ||
    !SAFE_CLAIM_VALUE_RE.test(values.ENTRA_REQUIRED_ROLE)
  ) {
    throw new EntraTokenError("configuration", "Entra claim configuration is invalid");
  }
  const tenantId = values.ENTRA_TENANT_ID.toLowerCase();
  const authorizedClientId = values.ENTRA_AUTHORIZED_CLIENT_ID.toLowerCase();
  return {
    ...values,
    ENTRA_TENANT_ID: tenantId,
    ENTRA_AUTHORIZED_CLIENT_ID: authorizedClientId,
    issuer: `https://${ENTRA_LOGIN_HOST}/${tenantId}/v2.0`,
    jwksUri: `https://${ENTRA_LOGIN_HOST}/${tenantId}/discovery/v2.0/keys`,
  };
}

export function isEntraIdentityEnabled() {
  try {
    configuredAuth();
    return true;
  } catch (error) {
    if (error instanceof EntraTokenError && error.code === "configuration") return false;
    throw error;
  }
}

function remoteJwks(uri) {
  let adapter = jwksByUri.get(uri);
  if (!adapter) {
    adapter = createRemoteJWKSet(new URL(uri));
    jwksByUri.set(uri, adapter);
  }
  return adapter;
}

function hasClaimValue(value, expected) {
  return Array.isArray(value) ? value.includes(expected) : value === expected;
}

export async function verifyEntraAccessToken(token) {
  if (typeof token !== "string" || !token.trim()) {
    throw new EntraTokenError("invalid", "Invalid access token");
  }

  const config = configuredAuth();
  let payload;
  try {
    ({ payload } = await jwtVerify(token, remoteJwks(config.jwksUri), {
      issuer: config.issuer,
      audience: config.ENTRA_API_AUDIENCE,
      algorithms: ["RS256"],
    }));
  } catch (error) {
    if (
      error?.code === "ERR_JWKS_TIMEOUT" ||
      (error?.code === undefined && error?.name !== "JOSEError")
    ) {
      throw new EntraTokenError("unavailable", "Authentication provider unavailable");
    }
    throw new EntraTokenError("invalid", "Invalid access token");
  }

  if (
    String(payload.tid ?? "").toLowerCase() !== config.ENTRA_TENANT_ID ||
    !GUID_RE.test(String(payload.oid ?? "")) ||
    payload.azp !== config.ENTRA_AUTHORIZED_CLIENT_ID ||
    !hasClaimValue(String(payload.scp ?? "").split(/\s+/), config.ENTRA_REQUIRED_SCOPE) ||
    !hasClaimValue(payload.roles, config.ENTRA_REQUIRED_ROLE)
  ) {
    throw new EntraTokenError("invalid", "Invalid access token");
  }

  const emailClaim = typeof payload.email === "string"
    ? payload.email
    : payload.preferred_username;
  const email = typeof emailClaim === "string"
    ? emailClaim.trim().toLowerCase()
    : "";
  if (!email || typeof payload.name !== "string" || !payload.name.trim()) {
    throw new EntraTokenError("invalid", "Invalid access token");
  }

  return {
    oid: String(payload.oid).trim().toLowerCase(),
    email,
    displayName: payload.name.trim(),
    firstName: typeof payload.given_name === "string" ? payload.given_name.trim() : "",
    lastName: typeof payload.family_name === "string" ? payload.family_name.trim() : "",
  };
}
