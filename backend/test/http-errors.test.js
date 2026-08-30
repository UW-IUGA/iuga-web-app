import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { once } from "node:events";
import express from "express";
import { httpErrorHandler, sendSpaError } from "../httpErrorHandler.js";

async function makeServer() {
  const app = express();
  app.use(express.json({ limit: "1kb" }));
  app.post("/", (_req, res) => res.json({ status: "success" }));
  app.use(httpErrorHandler);
  const server = app.listen(0);
  await once(server, "listening");
  return server;
}

async function request(server, body) {
  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return { status: response.status, body: await response.json() };
}

describe("HTTP parser errors", () => {
  it("returns a JSON 400 response for malformed JSON", async () => {
    const server = await makeServer();
    try {
      const response = await request(server, "{ malformed");
      assert.equal(response.status, 400);
      assert.deepEqual(response.body, {
        status: "error",
        message: "Malformed JSON request body",
      });
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("returns a JSON 413 response for oversized JSON", async () => {
    const server = await makeServer();
    try {
      const response = await request(server, JSON.stringify({ value: "x".repeat(2048) }));
      assert.equal(response.status, 413);
      assert.deepEqual(response.body, {
        status: "error",
        message: "Request body is too large",
      });
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("returns a generic JSON 500 response for unexpected errors", async () => {
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
      },
    };

    httpErrorHandler(
      new Error("database connection string should stay server-side"),
      {},
      res,
      () => {},
    );

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      status: "error",
      message: "There was an error on our side :(",
    });
  });

  it("returns a generic JSON 500 response for SPA delivery failures", () => {
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
      },
    };

    sendSpaError(res, new Error("filesystem details stay server-side"));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      status: "error",
      message: "There was an error on our side :(",
    });
  });
});
