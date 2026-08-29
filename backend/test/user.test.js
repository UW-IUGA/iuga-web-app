import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { makeTestApi } from "./testApi.js";
import usersRouter from "../routes/api/v1/controllers/user.js";

const GRAPH_URL = "https://graph.microsoft.com/v1.0/me";
const REAL_FETCH = globalThis.fetch;

function makeUserDoc(overrides = {}) {
  const doc = {
    _id: "user-1",
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

function makeUsersModel(existing = []) {
  const docs = [...existing];
  function Users(data) {
    const doc = makeUserDoc(data);
    docs.push(doc);
    return doc;
  }
  Users.docs = docs;
  Users.findOne = async (filter) =>
    docs.find((doc) => doc.uEmail === filter.uEmail) ?? null;
  return Users;
}

function makeModels(existing = []) {
  return { Users: makeUsersModel(existing) };
}

function graphProfile(overrides = {}) {
  return {
    displayName: "Jane Doe",
    givenName: "Jane",
    surname: "Doe",
    mail: "jane@uw.edu",
    userPrincipalName: "jdoe@uw.edu",
    ...overrides,
  };
}

function mockGraph(t, { ok = true, status = 200, data = {}, error } = {}) {
  t.mock.method(globalThis, "fetch", async (url, init) => {
    if (String(url) !== GRAPH_URL) return REAL_FETCH(url, init);
    if (error) throw error;
    return {
      ok,
      status,
      async json() {
        return data;
      },
    };
  });
}

async function login(api, authorization = "Bearer test-token") {
  return api.request("POST", "/user/login", undefined, {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("POST /user/login", () => {
  test("rejects a missing authorization header without contacting Graph", async () => {
    const models = makeModels();
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models,
      session: {},
    });

    try {
      const result = await api.request("POST", "/user/login", undefined, {
        headers: {},
      });

      assert.equal(result.status, 401);
      assert.equal(models.Users.docs.length, 0);
      assert.deepEqual(result.session, {});
    } finally {
      await api.close();
    }
  });

  test("rejects malformed and unsupported authorization headers", async (t) => {
    mockGraph(t, { data: graphProfile() });
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models: makeModels(),
      session: {},
    });

    try {
      for (const authorization of ["Basic credentials", "Bearer", "Bearer one two"]) {
        const result = await login(api, authorization);
        assert.equal(result.status, 401, authorization);
      }
    } finally {
      await api.close();
    }
  });

  test("returns 401 when Microsoft Graph rejects the token", async (t) => {
    mockGraph(t, { ok: false, status: 401 });
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models: makeModels(),
      session: {},
    });

    try {
      const result = await login(api);

      assert.equal(result.status, 401);
      assert.match(result.body.message, /invalid|authentication/i);
      assert.doesNotMatch(JSON.stringify(result.body), /test-token|Graph.*token/i);
    } finally {
      await api.close();
    }
  });

  test("maps Graph outages to an upstream error instead of invalidating the token", async (t) => {
    mockGraph(t, { ok: false, status: 503 });
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models: makeModels(),
      session: {},
    });

    try {
      const result = await login(api);

      assert.equal(result.status, 502);
      assert.match(result.body.message, /unavailable|provider/i);
    } finally {
      await api.close();
    }
  });

  test("returns a safe upstream error when Graph is unavailable", async (t) => {
    mockGraph(t, { error: new Error("upstream unavailable") });
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models: makeModels(),
      session: {},
    });

    try {
      const result = await login(api);

      assert.equal(result.status, 502);
      assert.doesNotMatch(JSON.stringify(result.body), /upstream unavailable/i);
    } finally {
      await api.close();
    }
  });

  test("rejects incomplete Graph identity without creating a user or session", async (t) => {
    mockGraph(t, { data: graphProfile({ mail: null, userPrincipalName: null }) });
    const models = makeModels();
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models,
      session: {},
    });

    try {
      const result = await login(api);

      assert.equal(result.status, 502);
      assert.equal(models.Users.docs.length, 0);
      assert.notEqual(result.session.isAuthenticated, true);
    } finally {
      await api.close();
    }
  });

  test("uses userPrincipalName when Graph omits mail", async (t) => {
    mockGraph(t, { data: graphProfile({ mail: null }) });
    const models = makeModels();
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models,
      session: {},
    });

    try {
      const result = await login(api);

      assert.equal(result.status, 200);
      assert.equal(result.session.email, "jdoe@uw.edu");
      assert.equal(models.Users.docs[0].uEmail, "jdoe@uw.edu");
    } finally {
      await api.close();
    }
  });

  test("syncs profile drift without duplicating an existing user", async (t) => {
    const existing = makeUserDoc({ uFirstName: "Old" });
    const models = makeModels([existing]);
    mockGraph(t, { data: graphProfile() });
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models,
      session: {},
    });

    try {
      const result = await login(api);

      assert.equal(result.status, 200);
      assert.equal(models.Users.docs.length, 1);
      assert.equal(existing.uFirstName, "Jane");
      assert.ok(existing.saveCalls >= 1);
    } finally {
      await api.close();
    }
  });

  test("rotates the session before establishing authenticated state", async (t) => {
    mockGraph(t, { data: graphProfile() });
    const session = {
      id: "anonymous-session",
      regenerate(callback) {
        this.id = "authenticated-session";
        this.regenerated = true;
        callback(null);
      },
    };
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models: makeModels(),
      session,
    });

    try {
      const result = await login(api);

      assert.equal(result.status, 200);
      assert.equal(result.session.regenerated, true);
      assert.equal(result.session.id, "authenticated-session");
      assert.equal(result.session.isAuthenticated, true);
    } finally {
      await api.close();
    }
  });

  test("passes an abort signal to the Graph request and handles cancellation safely", async (t) => {
    let receivedSignal;
    t.mock.method(globalThis, "fetch", async (url, init) => {
      if (String(url) !== GRAPH_URL) return REAL_FETCH(url, init);
      receivedSignal = init.signal;
      throw new DOMException("The operation timed out", "TimeoutError");
    });
    const api = await makeTestApi({
      router: usersRouter,
      mountPath: "/user",
      models: makeModels(),
      session: {},
    });

    try {
      const result = await login(api);

      assert.equal(result.status, 502);
      assert.ok(receivedSignal instanceof AbortSignal);
    } finally {
      await api.close();
    }
  });
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
});
