import assert from "node:assert/strict";
import { test } from "node:test";
import { makeTestApi } from "./testApi.js";
import usersRouter from "../routes/api/v1/controllers/user.js";

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
    doc.save = async function () {
        doc.saveCalls = (doc.saveCalls ?? 0) + 1;
        return doc;
    };
    return doc;
}

function makeUsersModel(existing = []) {
    const docs = [...existing];
    function Users(data) {
        const doc = makeUserDoc({ ...data });
        docs.push(doc);
        return doc;
    }
    Users.findOne = async (filter) => docs.find((d) => d.uEmail === filter.uEmail) ?? null;
    Users.docs = docs;
    return Users;
}

const graphUser = {
    displayName: "Jane Doe",
    givenName: "Jane",
    surname: "Doe",
    mail: "jane@uw.edu",
    userPrincipalName: "jdoe@uw.edu",
};

function mockGraph(t, data, ok = true) {
    t.mock.method(globalThis, "fetch", (url, init) => {
        if (String(url).includes("graph.microsoft.com")) {
            return Promise.resolve({ ok, json: async () => data });
        }
        return REAL_FETCH(url, init);
    });
}

test("login creates a user keyed on the Graph email", async (t) => {
    const models = { Users: makeUsersModel() };
    const api = await makeTestApi({ router: usersRouter, mountPath: "/user", models, session: {} });
    t.after(() => api.close());
    mockGraph(t, graphUser);

    const res = await api.request("POST", "/user/login", undefined, {
        headers: { authorization: "Bearer test-token" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.session.isAuthenticated, true);
    assert.equal(res.session.isAdmin, false);
    assert.equal(res.session.userId, "user-1");

    const created = await models.Users.findOne({ uEmail: "jane@uw.edu" });
    assert.ok(created, "user should be persisted");
    assert.equal(created.uEmail, "jane@uw.edu");
});

test("login falls back to userPrincipalName when Graph returns mail null", async (t) => {
    const models = { Users: makeUsersModel() };
    const api = await makeTestApi({ router: usersRouter, mountPath: "/user", models, session: {} });
    t.after(() => api.close());
    mockGraph(t, { ...graphUser, mail: null });

    const res = await api.request("POST", "/user/login", undefined, {
        headers: { authorization: "Bearer test-token" },
    });

    assert.equal(res.status, 200);
    assert.equal(res.session.email, "jdoe@uw.edu");
    const created = await models.Users.findOne({ uEmail: "jdoe@uw.edu" });
    assert.ok(created, "user must not be orphaned when mail is null");
    assert.equal(created.uEmail, "jdoe@uw.edu", "fallback stores userPrincipalName as the email key");
});

test("login syncs profile drift on an existing user without duplicating", async (t) => {
    const existing = makeUserDoc({ uFirstName: "Old", saveCalls: 0 });
    const models = { Users: makeUsersModel([existing]) };
    const api = await makeTestApi({ router: usersRouter, mountPath: "/user", models, session: {} });
    t.after(() => api.close());
    mockGraph(t, graphUser);

    const res = await api.request("POST", "/user/login", undefined, {
        headers: { authorization: "Bearer test-token" },
    });

    assert.equal(res.status, 200);
    assert.equal(models.Users.docs.length, 1, "existing user must not be duplicated");
    const synced = await models.Users.findOne({ uEmail: "jane@uw.edu" });
    assert.equal(synced.uFirstName, "Jane");
    assert.ok(synced.saveCalls >= 1, "existing user should be saved after drift sync");
});

test("login returns 401 when Microsoft Graph rejects the token", async (t) => {
    const models = { Users: makeUsersModel() };
    const api = await makeTestApi({ router: usersRouter, mountPath: "/user", models, session: {} });
    t.after(() => api.close());
    mockGraph(t, {}, false);

    const res = await api.request("POST", "/user/login", undefined, {
        headers: { authorization: "Bearer bad-token" },
    });

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Invalid access token or Microsoft Graph failure");
});
