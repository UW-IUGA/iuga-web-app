/*
 * @behavior Proves the Stripe webhook boundary accepts only exact, currently signed bytes and
 *           records them durably, so an unverified or repeated delivery can never become a
 *           payment fact.
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";
import { describe, it } from "node:test";
import express from "express";
import { createStripeWebhookRouter } from "../routes/api/v1/stripeWebhook.js";

const WEBHOOK_SECRET = "whsec_test_fixture_secret";
const STRIPE_ACCOUNT_ID = "acct_test_fixture";
const PINNED_API_VERSION = "2025-03-31.basil";

const STRIPE_ENV = {
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_ACCOUNT_ID,
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: PINNED_API_VERSION,
};

const WEBHOOK_PATH = "/api/v1/stripe/webhook";

/*
 * Stands in for the ReceivedStripeEvent model. It enforces the same unique
 * (accountId, livemode, eventId) index the real schema declares, so duplicate handling is
 * exercised against the real constraint rather than a stub that always succeeds.
 */
function createInboxModel() {
  const records = [];

  return {
    records,
    async create(document) {
      const duplicate = records.some(
        (record) =>
          record.accountId === document.accountId
          && record.livemode === document.livemode
          && record.eventId === document.eventId,
      );
      if (duplicate) {
        const error = new Error("E11000 duplicate key error collection: iuga.stripeinboxevents index: accountId_1_livemode_1_eventId_1");
        error.code = 11000;
        throw error;
      }
      records.push({ ...document });
      return { ...document };
    },
  };
}

function signPayload(rawBody, { secret = WEBHOOK_SECRET, timestamp } = {}) {
  const signedAt = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = crypto.createHmac("sha256", secret).update(`${signedAt}.${rawBody}`).digest("hex");
  return `t=${signedAt},v1=${signature}`;
}

function eventBody(overrides = {}) {
  return JSON.stringify({
    id: "evt_test_0001",
    object: "event",
    type: "checkout.session.completed",
    account: STRIPE_ACCOUNT_ID,
    livemode: false,
    api_version: PINNED_API_VERSION,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: "cs_test_0001", object: "checkout.session" } },
    ...overrides,
  });
}

/*
 * @param options.preParseJson — mount a JSON body parser ahead of the webhook, mirroring the
 *        mistake of registering the route below express.json(); the boundary must refuse a body
 *        it did not read itself.
 */
async function startWebhook({ env = STRIPE_ENV, model, preParseJson = false } = {}) {
  const app = express();
  if (preParseJson) app.use(express.json());
  app.use(WEBHOOK_PATH, createStripeWebhookRouter({ models: { ReceivedStripeEvent: model }, env }));

  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  return {
    async post(rawBody, { signature, contentType = "application/json", headers = {} } = {}) {
      const requestHeaders = { ...headers };
      if (contentType !== null) requestHeaders["content-type"] = contentType;
      if (signature !== null) requestHeaders["stripe-signature"] = signature ?? signPayload(rawBody);
      const response = await fetch(`http://127.0.0.1:${port}${WEBHOOK_PATH}`, {
        method: "POST",
        headers: requestHeaders,
        body: rawBody,
      });
      return { status: response.status, text: await response.text() };
    },
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

describe("Stripe webhook boundary", () => {
  it("accepts exactly signed bytes and records one durable observation", async () => {
    const model = createInboxModel();
    const api = await startWebhook({ model });

    try {
      const rawBody = eventBody();
      const response = await api.post(rawBody);

      assert.equal(response.status, 200);
      assert.equal(model.records.length, 1);
      assert.deepEqual(model.records[0], {
        accountId: STRIPE_ACCOUNT_ID,
        livemode: false,
        eventId: "evt_test_0001",
        eventType: "checkout.session.completed",
        apiVersion: PINNED_API_VERSION,
      });
    } finally {
      await api.close();
    }
  });

  it("never echoes the payload or the endpoint secret", async () => {
    const model = createInboxModel();
    const api = await startWebhook({ model });

    try {
      const response = await api.post(eventBody());

      assert.equal(response.status, 200);
      assert.equal(response.text.includes(WEBHOOK_SECRET), false);
      assert.equal(response.text.includes("evt_test_0001"), false);
    } finally {
      await api.close();
    }
  });

  it("records the configured account when Stripe omits the account field", async () => {
    const model = createInboxModel();
    const api = await startWebhook({ model });

    try {
      const response = await api.post(eventBody({ account: undefined }));

      assert.equal(response.status, 200);
      assert.equal(model.records[0].accountId, STRIPE_ACCOUNT_ID);
    } finally {
      await api.close();
    }
  });

  const rejectedPayloads = [
    {
      name: "mutated bytes under a signature for different bytes",
      rawBody: () => eventBody({ id: "evt_test_tampered" }),
      signature: () => signPayload(eventBody()),
    },
    {
      name: "a signature made with a different secret",
      rawBody: () => eventBody(),
      signature: () => signPayload(eventBody(), { secret: "whsec_other_secret" }),
    },
    {
      name: "a stale timestamp",
      rawBody: () => eventBody(),
      signature: () => signPayload(eventBody(), { timestamp: Math.floor(Date.now() / 1000) - 3600 }),
    },
    {
      name: "a wrong account",
      rawBody: () => eventBody({ account: "acct_someone_else" }),
    },
    {
      name: "a livemode that disagrees with the configured mode",
      rawBody: () => eventBody({ livemode: true }),
    },
    {
      name: "a different pinned API version",
      rawBody: () => eventBody({ api_version: "2020-01-01.old" }),
    },
    {
      name: "an event with no id",
      rawBody: () => eventBody({ id: undefined }),
    },
    {
      name: "an event with no type",
      rawBody: () => eventBody({ type: undefined }),
    },
    {
      name: "malformed JSON",
      rawBody: () => '{ "id": "evt_test_0001", "object": "event"',
    },
    {
      name: "an oversized payload",
      rawBody: () => eventBody({ padding: "x".repeat(300 * 1024) }),
    },
  ];

  for (const { name, rawBody, signature } of rejectedPayloads) {
    it(`rejects ${name} with a safe 400 and no durable record`, async () => {
      const model = createInboxModel();
      const api = await startWebhook({ model });

      try {
        const body = rawBody();
        const response = await api.post(
          body,
          signature ? { signature: signature() } : {},
        );

        assert.equal(response.status, 400);
        assert.equal(model.records.length, 0);
        assert.equal(response.text.includes(WEBHOOK_SECRET), false);
      } finally {
        await api.close();
      }
    });
  }

  it("rejects a request with no signature header", async () => {
    const model = createInboxModel();
    const api = await startWebhook({ model });

    try {
      const response = await api.post(eventBody(), { signature: null });

      assert.equal(response.status, 400);
      assert.equal(model.records.length, 0);
    } finally {
      await api.close();
    }
  });

  it("rejects a body a JSON parser consumed first", async () => {
    const model = createInboxModel();
    const api = await startWebhook({ model, preParseJson: true });

    try {
      const response = await api.post(eventBody());

      assert.equal(response.status, 400);
      assert.equal(model.records.length, 0);
    } finally {
      await api.close();
    }
  });

  it("accepts a duplicate delivery without a second durable record", async () => {
    const model = createInboxModel();
    const api = await startWebhook({ model });

    try {
      const first = await api.post(eventBody());
      const second = await api.post(eventBody());

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(model.records.length, 1);
    } finally {
      await api.close();
    }
  });

  it("scopes the duplicate key by livemode", async () => {
    const model = createInboxModel();
    const testMode = await startWebhook({ model });
    const liveMode = await startWebhook({
      model,
      env: { ...STRIPE_ENV, STRIPE_MODE: "live" },
    });

    try {
      const inTest = await testMode.post(eventBody());
      const inLive = await liveMode.post(eventBody({ livemode: true }));

      assert.equal(inTest.status, 200);
      assert.equal(inLive.status, 200);
      assert.equal(model.records.length, 2);
    } finally {
      await testMode.close();
      await liveMode.close();
    }
  });

  it("scopes the duplicate key by account", async () => {
    const model = createInboxModel();
    const firstAccount = await startWebhook({ model });
    const secondAccount = await startWebhook({
      model,
      env: { ...STRIPE_ENV, STRIPE_ACCOUNT_ID: "acct_second_fixture" },
    });

    try {
      const first = await firstAccount.post(eventBody());
      const second = await secondAccount.post(eventBody({ account: "acct_second_fixture" }));

      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(model.records.length, 2);
    } finally {
      await firstAccount.close();
      await secondAccount.close();
    }
  });

  it("refuses to run without an endpoint secret configured", async () => {
    const model = createInboxModel();
    const api = await startWebhook({
      model,
      env: { ...STRIPE_ENV, STRIPE_WEBHOOK_SECRET: undefined },
    });

    try {
      const response = await api.post(eventBody());

      assert.equal(response.status, 400);
      assert.equal(model.records.length, 0);
    } finally {
      await api.close();
    }
  });

  it("refuses to run without an account configured", async () => {
    const model = createInboxModel();
    const api = await startWebhook({
      model,
      env: { ...STRIPE_ENV, STRIPE_ACCOUNT_ID: undefined },
    });

    try {
      const response = await api.post(eventBody());

      assert.equal(response.status, 400);
      assert.equal(model.records.length, 0);
    } finally {
      await api.close();
    }
  });
});
