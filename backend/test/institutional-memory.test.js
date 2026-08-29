import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import charterRouter from "../routes/api/v1/controllers/charter.js";
import journalRouter from "../routes/api/v1/controllers/journal.js";
import contactsRouter from "../routes/api/v1/controllers/contacts.js";
import { makeTestApi } from "./testApi.js";

const authorId = "507f1f77bcf86cd799439011";
const otherAuthorId = "507f1f77bcf86cd799439012";
const cycleId = "507f1f77bcf86cd799439013";
const entryId = "507f1f77bcf86cd799439014";
const contactId = "507f1f77bcf86cd799439015";

const activeCycle = { _id: cycleId, status: "active" };

function queryChain(result) {
  return {
    sort() { return this; },
    populate() { return this; },
    async lean() { return result; },
  };
}

function makeModels({ permissions = [], charterSection, updatedEntry = null } = {}) {
  const section = charterSection || {
    _id: "507f1f77bcf86cd799439016",
    sectionKey: "marketing",
    category: "marketing_collaboration",
    title: "Marketing and collaboration",
    content: "Original guidance",
    revisions: [],
    async save() { return this; },
  };

  return {
    Cycles: {
      findOne() { return { async lean() { return activeCycle; } }; },
    },
    RoleAssignments: {
      find() {
        return {
          async populate() {
            return [{ cycleId, roleId: { isActive: true, permissions } }];
          },
        };
      },
    },
    CharterDocuments: {
      find() { return queryChain([section]); },
      async findOne() { return section; },
    },
    JournalEntries: {
      find() { return queryChain([]); },
      async create(fields) { return { _id: entryId, ...fields }; },
      async findOneAndUpdate(filter, update) {
        if (filter.authorId !== authorId) return null;
        return { _id: entryId, authorId, ...update.$set, ...(updatedEntry || {}) };
      },
    },
    Contacts: {
      find() { return queryChain([]); },
      async create(fields) { return { _id: contactId, ...fields }; },
      async findByIdAndUpdate() { return { _id: contactId }; },
    },
  };
}

describe("institutional memory APIs", () => {
  let charterApi;
  let journalApi;
  let contactsApi;

  before(async () => {
    const session = { isAuthenticated: true, userId: authorId };
    charterApi = await makeTestApi({
      router: charterRouter,
      mountPath: "/api/v1/charter",
      models: makeModels({ permissions: ["charter.read", "charter.manage"] }),
      session,
    });
    journalApi = await makeTestApi({
      router: journalRouter,
      mountPath: "/api/v1/journal",
      models: makeModels({ permissions: ["journal.read", "journal.create", "journal.edit_own"] }),
      session,
    });
    contactsApi = await makeTestApi({
      router: contactsRouter,
      mountPath: "/api/v1/contacts",
      models: makeModels({ permissions: ["contacts.read", "contacts.manage"] }),
      session,
    });
  });

  after(async () => {
    await Promise.all([charterApi.close(), journalApi.close(), contactsApi.close()]);
  });

  it("requires the named permission before exposing charter content", async () => {
    const result = await charterApi.request("GET", "/api/v1/charter", undefined, {
      models: makeModels({ permissions: [] }),
    });

    assert.equal(result.status, 403);
    assert.equal(result.body.message, "Not authorized");
  });

  it("records charter revisions with the authenticated editor", async () => {
    const section = {
      _id: "507f1f77bcf86cd799439016",
      sectionKey: "marketing",
      category: "marketing_collaboration",
      title: "Marketing and collaboration",
      content: "Original guidance",
      revisions: [],
      async save() { return this; },
    };
    const result = await charterApi.request("PATCH", "/api/v1/charter/marketing", { content: "Updated guidance" }, {
      models: makeModels({ permissions: ["charter.manage"], charterSection: section }),
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.section.content, "Updated guidance");
    assert.equal(result.body.section.revisions[0].authorId, authorId);
    assert.equal(result.body.section.revisions[0].content, "Original guidance");
  });

  it("derives journal authorship and academic cycle from the session", async () => {
    const result = await journalApi.request("POST", "/api/v1/journal", {
      entryDate: "2026-08-28",
      body: "Students want more advising visibility.",
      tags: ["Advising"],
    });

    assert.equal(result.status, 201);
    assert.equal(result.body.entry.authorId, authorId);
    assert.equal(result.body.entry.cycleId, cycleId);
    assert.deepEqual(result.body.entry.tags, ["advising"]);
  });

  it("does not allow a journal author to edit another author's entry", async () => {
    const result = await journalApi.request("PATCH", `/api/v1/journal/${entryId}`, {
      entryDate: "2026-08-28",
      body: "Attempted overwrite",
      tags: [],
    }, {
      session: { userId: otherAuthorId },
    });

    assert.equal(result.status, 404);
    assert.equal(result.body.message, "Journal entry not found");
  });

  it("stores contact ownership from the authenticated session", async () => {
    const result = await contactsApi.request("POST", "/api/v1/contacts", {
      name: "A. Contact",
      organization: "Example Co.",
      role: "Alumni liaison",
      contactMethod: "contact@example.com",
      notes: "Interested in a panel.",
      engagementTypes: ["company panels"],
      eventIds: [],
    });

    assert.equal(result.status, 201);
    assert.equal(result.body.contact.relationshipOwnerId, authorId);
  });
});
