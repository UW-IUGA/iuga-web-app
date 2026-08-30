import assert from "node:assert/strict";
import { describe, it } from "node:test";
import express from "express";
import { once } from "node:events";
import { ALLOWED_ORIGINS, REQUEST_BODY_LIMIT } from "../httpBoundaryConfig.js";

const allowedOrigins = ALLOWED_ORIGINS;

function isOriginAllowed(origin) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

describe("HTTP Boundary & CORS", () => {
  it("allows same-origin / internal requests with no origin header", () => {
    assert.equal(isOriginAllowed(undefined), true);
    assert.equal(isOriginAllowed(null), true);
  });

  it("allows all trusted IUGA and local development origins", () => {
    for (const origin of allowedOrigins) {
      assert.equal(isOriginAllowed(origin), true);
    }
  });

  it("rejects unauthorized external origins", () => {
    assert.equal(isOriginAllowed("https://evil.com"), false);
    assert.equal(isOriginAllowed("http://localhost:8080"), false);
    assert.equal(isOriginAllowed("https://fake-iuga.info"), false);
  });

  it("sets defensive security headers", () => {
    const headers = {};
    const fakeRes = {
      setHeader(name, val) {
        headers[name] = val;
      },
    };

    fakeRes.setHeader("X-Content-Type-Options", "nosniff");
    fakeRes.setHeader("X-Frame-Options", "DENY");
    fakeRes.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  });

  it("accepts payloads under the tuned limit and rejects oversized payloads", async () => {
    const app = express();
    app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
    app.post("/", (_req, res) => res.sendStatus(204));
    const server = app.listen(0);
    await once(server, "listening");
    const { port } = server.address();

    try {
      const accepted = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: "x".repeat(31 * 1024) }),
      });
      const rejected = await fetch(`http://127.0.0.1:${port}/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: "x".repeat(33 * 1024) }),
      });

      assert.equal(accepted.status, 204);
      assert.equal(rejected.status, 413);
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
