import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContactRouter } from "../routes/api/v1/controllers/contact.js";
import { makeTestApi } from "./testApi.js";

const validContact = {
  name: "Avery Chen",
  email: "avery@example.com",
  inquiryType: "Student",
  message: "I would like to learn more about IUGA.",
};

describe("contact API", () => {
  let api;
  let deliveries;

  before(async () => {
    deliveries = [];
    api = await makeTestApi({
      router: createContactRouter({
        sendContactEmail: async (contact) => deliveries.push(contact),
      }),
      mountPath: "/api/v1/contact",
      models: {},
    });
  });

  after(async () => {
    await api.close();
  });

  it("validates and delivers a contact message", async () => {
    const result = await api.request("POST", "/api/v1/contact", validContact);

    assert.equal(result.status, 201);
    assert.equal(result.body.status, "success");
    assert.deepEqual(deliveries.at(-1), validContact);
  });

  it("rejects incomplete or invalid contact messages", async () => {
    const result = await api.request("POST", "/api/v1/contact", {
      ...validContact,
      email: "not-an-email",
      message: "",
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.status, "error");
  });

  it("silently accepts the honeypot field without delivering mail", async () => {
    const beforeCount = deliveries.length;
    const result = await api.request("POST", "/api/v1/contact", {
      ...validContact,
      website: "https://spam.example",
    });

    assert.equal(result.status, 201);
    assert.equal(deliveries.length, beforeCount);
  });
});
