import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createCsrfProtection } from "../routes/api/v1/utils/csrf.js";

function makeResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function makeRequest({ method = "POST", origin, authenticated = true } = {}) {
  return {
    method,
    headers: origin === undefined ? {} : { origin },
    session: { isAuthenticated: authenticated },
  };
}

describe("CSRF protection", () => {
  const protect = createCsrfProtection({
    allowedOrigins: ["http://localhost:3000"],
  });

  it("rejects authenticated mutations without an origin", () => {
    const req = makeRequest();
    const res = makeResponse();
    let nextCalled = false;

    protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, {
      status: "error",
      message: "CSRF validation failed",
    });
    assert.equal(nextCalled, false);
  });

  it("rejects authenticated mutations from an untrusted origin", () => {
    const req = makeRequest({ origin: "https://evil.example" });
    const res = makeResponse();
    let nextCalled = false;

    protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
  });

  it("allows authenticated mutations from a configured origin", () => {
    const req = makeRequest({ origin: "http://localhost:3000" });
    const res = makeResponse();
    let nextCalled = false;

    protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
  });

  it("does not require an origin for safe or unauthenticated requests", () => {
    for (const req of [
      makeRequest({ method: "GET" }),
      makeRequest({ authenticated: false }),
    ]) {
      const res = makeResponse();
      let nextCalled = false;

      protect(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.equal(res.statusCode, null);
    }
  });
});
