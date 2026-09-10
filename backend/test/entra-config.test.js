import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { isEntraIdentityEnabled } from "../routes/api/v1/utils/entraAccessToken.js";

const TEST_ENV_KEYS = [
  "ENTRA_TENANT_ID",
  "ENTRA_API_AUDIENCE",
  "ENTRA_AUTHORIZED_CLIENT_ID",
  "ENTRA_REQUIRED_SCOPE",
  "ENTRA_REQUIRED_ROLE",
];

const originalEnv = Object.fromEntries(
  TEST_ENV_KEYS.map((key) => [key, process.env[key]])
);

function restoreEnv() {
  for (const key of TEST_ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
}

after(restoreEnv);

function setEnv(overrides = {}) {
  const base = {
    ENTRA_TENANT_ID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    ENTRA_API_AUDIENCE: "api://11111111-2222-3333-4444-555555555555",
    ENTRA_AUTHORIZED_CLIENT_ID: "99999999-8888-7777-6666-555555555555",
    ENTRA_REQUIRED_SCOPE: "access_as_user",
    ENTRA_REQUIRED_ROLE: "Shopper",
  };
  const config = { ...base, ...overrides };
  for (const key of TEST_ENV_KEYS) {
    if (config[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = config[key];
    }
  }
}

describe("isEntraIdentityEnabled", () => {
  test("accepts valid config with audience as api://GUID", () => {
    setEnv({ ENTRA_API_AUDIENCE: "api://11111111-2222-3333-4444-555555555555" });
    assert.equal(isEntraIdentityEnabled(), true);
  });

  test("accepts valid config with audience as bare GUID", () => {
    setEnv({ ENTRA_API_AUDIENCE: "11111111-2222-3333-4444-555555555555" });
    assert.equal(isEntraIdentityEnabled(), true);
  });

  test("rejects malformed ENTRA_API_AUDIENCE", () => {
    setEnv({ ENTRA_API_AUDIENCE: "not-a-guid" });
    assert.equal(isEntraIdentityEnabled(), false);
  });

  test("rejects malformed ENTRA_AUTHORIZED_CLIENT_ID", () => {
    setEnv({ ENTRA_AUTHORIZED_CLIENT_ID: "not-a-guid" });
    assert.equal(isEntraIdentityEnabled(), false);
  });

  test("rejects ENTRA_REQUIRED_SCOPE containing whitespace or invalid token characters", () => {
    setEnv({ ENTRA_REQUIRED_SCOPE: "access as user" });
    assert.equal(isEntraIdentityEnabled(), false);
  });

  test("rejects ENTRA_REQUIRED_ROLE containing whitespace or invalid token characters", () => {
    setEnv({ ENTRA_REQUIRED_ROLE: "Shopper Role" });
    assert.equal(isEntraIdentityEnabled(), false);
  });

  test("rejects when required configuration is missing", () => {
    setEnv({ ENTRA_TENANT_ID: undefined });
    assert.equal(isEntraIdentityEnabled(), false);
  });
});
