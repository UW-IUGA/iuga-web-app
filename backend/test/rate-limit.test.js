import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";

import userRouter from "../routes/api/v1/controllers/user.js";
import {
  configureTrustedProxy,
  createRateLimiter,
} from "../routes/api/v1/utils/rateLimit.js";
import { makeTestApi } from "./testApi.js";

const emptyModels = {};

describe("login rate limiting", () => {
  it("returns 429 after ten login attempts from one address", async () => {
    const api = await makeTestApi({
      router: userRouter,
      mountPath: "/user",
      models: emptyModels,
    });

    try {
      const responses = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        responses.push(await api.request("POST", "/user/login"));
      }

      assert.deepStrictEqual(
        responses.slice(0, 10).map((response) => response.status),
        Array(10).fill(401),
      );
      assert.deepStrictEqual(responses[10].body, {
        status: "error",
        message: "Too many requests, please try again later",
      });
      assert.strictEqual(responses[10].status, 429);
    } finally {
      await api.close();
    }
  });
});

describe("rate limiter state bounds", () => {
  it("configures one trusted reverse-proxy hop", () => {
    const app = express();

    configureTrustedProxy(app);

    assert.equal(app.get("trust proxy"), 1);
  });

  it("evicts the oldest client when the configured capacity is full", async () => {
    const app = express();
    app.set("trust proxy", 1);
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 60_000,
      maxClients: 2,
    });
    app.get("/probe", limiter, (_req, res) => res.json({ status: "success" }));
    const server = app.listen(0);
    await once(server, "listening");
    const { port } = server.address();

    const request = (client) =>
      fetch(`http://127.0.0.1:${port}/probe`, {
        headers: { "x-forwarded-for": client },
      });

    try {
      assert.equal((await request("198.51.100.1")).status, 200);
      assert.equal((await request("198.51.100.2")).status, 200);
      assert.equal((await request("198.51.100.1")).status, 429);
      assert.equal((await request("198.51.100.3")).status, 200);
      assert.equal((await request("198.51.100.1")).status, 200);
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});

describe("rate limiter middleware", () => {
  it("returns the repository error shape after the configured limit", async () => {
    const app = express();
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const server = app.listen(0);
    await once(server, "listening");
    const { port } = server.address();
    app.get("/probe", limiter, (_req, res) => res.json({ status: "success" }));

    try {
      const responses = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await fetch(`http://127.0.0.1:${port}/probe`);
        responses.push({ status: response.status, body: await response.json() });
      }

      assert.deepStrictEqual(
        responses.slice(0, 2).map((response) => response.status),
        [200, 200],
      );
      assert.deepStrictEqual(responses[2], {
        status: 429,
        body: {
          status: "error",
          message: "Too many requests, please try again later",
        },
      });
    } finally {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
