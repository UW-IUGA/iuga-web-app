import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";
import { after, before, describe, it } from "node:test";
import { once } from "node:events";
import { createDiscordRouter } from "../routes/api/v1/controllers/discord.js";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const publicKeyHex = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
const otherPrivateKey = crypto.generateKeyPairSync("ed25519").privateKey;

function sign(body, timestamp = "1700000000", key = privateKey) {
  const signature = crypto.sign(null, Buffer.concat([Buffer.from(timestamp), body]), key);
  return { "X-Signature-Ed25519": signature.toString("hex"), "X-Signature-Timestamp": timestamp };
}

describe("Discord interactions endpoint", () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = express();
    app.use("/api/v1/discord", createDiscordRouter({ publicKey: publicKeyHex }));
    app.use((err, _req, res, _next) => res.status(err.status ?? 500).json({ error: err.type ?? "error" }));
    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1/discord/interactions`;
  });

  after(() => server.close());

  async function post(body, headers) {
    return fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    });
  }

  it("answers a signed PING with PONG", async () => {
    const body = Buffer.from(JSON.stringify({ type: 1 }));
    const response = await post(body, sign(body));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { type: 1 });
  });

  it("rejects a request signed with the wrong key", async () => {
    const body = Buffer.from(JSON.stringify({ type: 1 }));
    const response = await post(body, sign(body, "1700000000", otherPrivateKey));
    assert.equal(response.status, 401);
  });

  it("rejects a tampered body", async () => {
    const signedBody = Buffer.from(JSON.stringify({ type: 1 }));
    const sentBody = Buffer.from(JSON.stringify({ type: 2 }));
    const response = await post(sentBody, sign(signedBody));
    assert.equal(response.status, 401);
  });

  it("rejects a request with no signature headers", async () => {
    const response = await post(Buffer.from(JSON.stringify({ type: 1 })), {});
    assert.equal(response.status, 401);
  });

  it("rejects an oversized body", async () => {
    const body = Buffer.from(JSON.stringify({ type: 1, padding: "x".repeat(40 * 1024) }));
    const response = await post(body, sign(body));
    assert.equal(response.status, 413);
  });

  it("answers a signed non-PING interaction with an ephemeral placeholder", async () => {
    const body = Buffer.from(JSON.stringify({ type: 2, data: { name: "event" } }));
    const response = await post(body, sign(body));
    assert.equal(response.status, 200);
    const json = await response.json();
    assert.equal(json.type, 4);
    assert.equal(json.data.flags, 64);
  });
});
