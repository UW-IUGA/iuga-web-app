import assert from "node:assert/strict";
import { after, describe, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { makeTestApi } from "./testApi.js";
import usersRouter from "../routes/api/v1/controllers/user.js";

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const ISSUER = `https://login.microsoftonline.com/${TENANT_ID}/v2.0`;
const AUDIENCE = "api://44444444-4444-4444-8444-444444444444";
const SPA_CLIENT_ID = "55555555-5555-4555-8555-555555555555";
const JWKS_URL = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;
const REQUIRED_SCOPE = "access_as_user";
const REQUIRED_ROLE = "Shopper";
const OID = "11111111-1111-4111-8111-111111111111";
const OTHER_OID = "22222222-2222-4222-8222-222222222222";
const AUTH_ENV = [
  "ENTRA_TENANT_ID",
  "ENTRA_API_AUDIENCE",
  "ENTRA_REQUIRED_SCOPE",
  "ENTRA_REQUIRED_ROLE",
  "ENTRA_AUTHORIZED_CLIENT_ID",
];
const originalAuthEnv = Object.fromEntries(AUTH_ENV.map((name) => [name, process.env[name]]));
const REAL_FETCH = globalThis.fetch;
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
jwk.kid = "test-key";
jwk.use = "sig";
jwk.alg = "RS256";

function makeUserDoc(overrides = {}) {
  const doc = {
    _id: "user-1",
    entraObjectId: OID,
    uFirstName: "Jane",
    uLastName: "Doe",
    uDisplayName: "Jane Doe",
    uEmail: "jane@uw.edu",
    uType: "Member",
    ...overrides,
  };
  doc.save = async function save() {
    doc.saveCalls = (doc.saveCalls ?? 0) + 1;
    return doc;
  };
  return doc;
}

function makeUsersModel(existing = [], { duplicateOnSave = false } = {}) {
  const docs = [...existing];
  let firstInsert = true;
  let firstOidLookup = true;
  function Users(data) {
    const doc = makeUserDoc(data);
    doc.save = async function save() {
      doc.saveCalls = (doc.saveCalls ?? 0) + 1;
      if (duplicateOnSave && firstInsert) {
        firstInsert = false;
        throw Object.assign(new Error("duplicate key"), { code: 11000 });
      }
      if (!docs.includes(doc)) docs.push(doc);
      return doc;
    };
    return doc;
  }
  Users.docs = docs;
  Users.findOne = async (filter) => {
    if (filter?.entraObjectId !== undefined) {
      if (duplicateOnSave && firstOidLookup) {
        firstOidLookup = false;
        return null;
      }
      return docs.find((doc) => doc.entraObjectId === filter.entraObjectId) ?? null;
    }
    if (filter?.uEmail !== undefined) {
      if (duplicateOnSave) return null;
      return docs.find((doc) => doc.uEmail === filter.uEmail) ?? null;
    }
    return null;
  };
  return Users;
}

function makeModels(existing = [], options) {
  return { Users: makeUsersModel(existing, options) };
}

async function signedToken(overrides = {}, options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: ISSUER,
    aud: AUDIENCE,
    tid: TENANT_ID,
    oid: OID.toUpperCase(),
    azp: SPA_CLIENT_ID,
    scp: REQUIRED_SCOPE,
    roles: [REQUIRED_ROLE],
    preferred_username: " JANE@UW.EDU ",
    name: "Jane Doe",
    given_name: "Jane",
    family_name: "Doe",
    iat: now,
    exp: now + 300,
    ...overrides,
  };
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: options.kid ?? "test-key", typ: "JWT" })
    .sign(options.key ?? privateKey);
}

function mockJwks(t, { keys = [jwk], error } = {}) {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const target = String(url);
    if (target.startsWith("http://127.0.0.1:")) return REAL_FETCH(url, init);
    if (target !== JWKS_URL) throw new Error("unexpected external request");
    if (error) throw error;
    return {
      ok: true,
      status: 200,
      async json() {
        return { keys };
      },
    };
  });
}

function configureAuth() {
  process.env.ENTRA_TENANT_ID = TENANT_ID;
  process.env.ENTRA_API_AUDIENCE = AUDIENCE;
  process.env.ENTRA_REQUIRED_SCOPE = REQUIRED_SCOPE;
  process.env.ENTRA_REQUIRED_ROLE = REQUIRED_ROLE;
  process.env.ENTRA_AUTHORIZED_CLIENT_ID = SPA_CLIENT_ID;
}

after(() => {
  for (const name of AUTH_ENV) {
    if (originalAuthEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalAuthEnv[name];
  }
});

async function login(api, token, session) {
  return api.request("POST", "/user/login", undefined, {
    session,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function makeLoginApi(models = makeModels(), session = {}) {
  configureAuth();
  return makeTestApi({ router: usersRouter, mountPath: "/user", models, session });
}

async function assertRejected(t, tokenOverrides, expectedStatus = 401) {
  mockJwks(t);
  const models = makeModels();
  const session = {};
  const api = await makeLoginApi(models, session);
  try {
    const token = await signedToken(tokenOverrides);
    const result = await login(api, token);
    assert.equal(result.status, expectedStatus);
    assert.equal(models.Users.docs.length, 0);
    assert.notEqual(result.session.isAuthenticated, true);
  } finally {
    await api.close();
  }

}

describe("POST /user/login", () => {

  test("rejects a missing bearer token before contacting JWKS or creating a session", async () => {
    const models = makeModels();
    const session = {};
    const api = await makeLoginApi(models, session);
    try {
      const result = await api.request("POST", "/user/login", undefined, { headers: {} });
      assert.equal(result.status, 401);
      assert.equal(models.Users.docs.length, 0);
      assert.deepEqual(session, {});
    } finally {
      await api.close();
    }
  });
  test("verifies a real JWT through JWKS, creates by canonical oid, and stores only the internal user id in session", async (t) => {
    mockJwks(t);
    const models = makeModels();
    const session = {
      id: "anonymous-session",
      regenerate(callback) {
        this.id = "authenticated-session";
        this.regenerated = true;
        callback(null);
      },
    };
    const api = await makeLoginApi(models, session);
    try {
      const result = await login(api, await signedToken());
      assert.equal(result.status, 200);
      assert.equal(models.Users.docs.length, 1);
      assert.equal(models.Users.docs[0].entraObjectId, OID);
      assert.equal(models.Users.docs[0].uEmail, "jane@uw.edu");
      assert.equal(result.session.userId, "user-1");
      assert.equal(result.session.regenerated, true);
      assert.equal(result.session.id, "authenticated-session");
    } finally {
      await api.close();
    }
  });

  test("accepts a canonical oid whose version and variant fall outside RFC restrictions and binds it", async (t) => {
    mockJwks(t);
    const models = makeModels();
    const api = await makeLoginApi(models);
    const nonRfcOid = "01234567-89ab-cdef-0123-456789abcdef";
    try {
      const result = await login(api, await signedToken({ oid: nonRfcOid }));
      assert.equal(result.status, 200);
      assert.equal(models.Users.docs.length, 1);
      assert.equal(models.Users.docs[0].entraObjectId, nonRfcOid);
      assert.equal(result.session.userId, "user-1");
    } finally {
      await api.close();
    }
  });

  test("finds an existing user by oid and updates normalized contact/profile data without duplicating", async (t) => {
    mockJwks(t);
    const existing = makeUserDoc({ uEmail: "old@example.com", uFirstName: "Old" });
    const models = makeModels([existing]);
    const api = await makeLoginApi(models, {});
    try {
      const result = await login(api, await signedToken());
      assert.equal(result.status, 200);
      assert.equal(models.Users.docs.length, 1);
      assert.equal(existing.uEmail, "jane@uw.edu");
      assert.equal(existing.uFirstName, "Jane");
      assert.ok(existing.saveCalls >= 1);
    } finally {
      await api.close();
    }
  });

  test("refuses linking a different oid that presents an existing email", async (t) => {
    mockJwks(t);
    const existing = makeUserDoc({ entraObjectId: OTHER_OID, uEmail: "jane@uw.edu" });
    const models = makeModels([existing]);
    const session = {};
    const api = await makeLoginApi(models, session);
    try {
      const result = await login(api, await signedToken());
      assert.equal(result.status, 409);
      assert.equal(models.Users.docs.length, 1);
      assert.deepEqual(session, {});
    } finally {
      await api.close();
    }
  });

  test("re-reads the exact oid after a duplicate-key insert race and converges", async (t) => {
    mockJwks(t);
    const racedUser = makeUserDoc({ entraObjectId: OID });
    const models = makeModels([racedUser], { duplicateOnSave: true });
    const session = {};
    const api = await makeLoginApi(models, session);
    try {
      const result = await login(api, await signedToken());
      assert.equal(result.status, 200);
      assert.equal(result.session.userId, racedUser._id);
      assert.equal(models.Users.docs.length, 1);
    } finally {
      await api.close();
    }
  });

  test("rejects a wrong signature before persistence and session creation", async (t) => {
    mockJwks(t);
    const { privateKey: otherKey } = await generateKeyPair("RS256");
    const token = await signedToken({}, { key: otherKey });
    const models = makeModels();
    const session = {};
    const api = await makeLoginApi(models, session);
    try {
      const result = await login(api, token);
      assert.equal(result.status, 401);
      assert.equal(models.Users.docs.length, 0);
      assert.deepEqual(session, {});
    } finally { await api.close(); }
  });

  for (const [label, claims] of [
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 1 }],
    ["the wrong tenant", { tid: "other-tenant" }],
    ["the wrong issuer", { iss: "https://issuer.invalid" }],
    ["the wrong audience", { aud: "other-audience" }],
    ["a missing scope", { scp: "profile" }],
    ["a missing Shopper role", { roles: ["Reader"] }],
    ["a malformed non-GUID oid", { oid: "not-a-guid" }],
    ["the wrong authorized SPA client", { azp: "other-client" }],
    ["a missing oid", { oid: undefined }],
  ]) {
    test(`rejects ${label} before persistence and session creation`, async (t) => {
      await assertRejected(t, claims);
    });
  }
});

describe("POST /user/logout", () => {
  test("returns a safe server error when session destruction fails", async () => {
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/api/v1/user",
      models: {},
      session: {
        isAuthenticated: true,
        destroy(callback) {
          callback(new Error("session store unavailable"));
        },
      },
    });

    try {
      const result = await api.request("POST", "/api/v1/user/logout");
      assert.equal(result.status, 500);
      assert.deepEqual(result.body, {
        status: "error",
        message: "There was an error on our side :(",
      });
    } finally {
      await api.close();
    }
  });

  test("destroys session and returns success status", async () => {
    let destroyed = false;
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/api/v1/user",
      models: {},
      session: {
        isAuthenticated: true,
        destroy(callback) {
          destroyed = true;
          callback(null);
        },
      },
    });

    try {
      const result = await api.request("POST", "/api/v1/user/logout");
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { status: "success" });
      assert.equal(destroyed, true);
    } finally {
      await api.close();
    }
  });
});
