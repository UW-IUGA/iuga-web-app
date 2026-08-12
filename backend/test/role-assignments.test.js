import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import rolesRouter from "../routes/api/v1/controllers/roles.js";
import { makeTestApi } from "./testApi.js";

const userId = "507f1f77bcf86cd799439011";
const roleId = "507f1f77bcf86cd799439012";
const assignmentId = "507f1f77bcf86cd799439013";

function makeModels({
  existingAssignment = null,
  roleActive = true,
  updatedAssignment = null,
} = {}) {
  return {
    Users: {
      async findById(id) {
        return id === userId ? { _id: userId } : null;
      },
    },
    Roles: {
      async findById(id) {
        return id === roleId ? { _id: roleId, isActive: roleActive } : null;
      },
    },
    Committees: {
      async findById() {
        return null;
      },
    },
    RoleAssignments: {
      find() {
        return {
          async populate() {
            return [{ roleId: { isActive: true, permissions: ["users.roles.manage"] } }];
          },
        };
      },
      async findOne() {
        return existingAssignment;
      },
      async create(fields) {
        return { _id: assignmentId, ...fields };
      },
      async findOneAndUpdate() {
        return updatedAssignment;
      },
    },
  };
}

describe("role assignment API", () => {
  let api;

  before(async () => {
    api = await makeTestApi({
      router: rolesRouter,
      mountPath: "/api/v1/roles",
      models: makeModels(),
      session: {
        isAuthenticated: true,
        isAdmin: true,
        userId: "507f1f77bcf86cd799439014",
      },
    });
  });

  after(async () => {
    await api.close();
  });
  it("creates an assignment for an existing user and active role", async () => {
    const result = await api.request(
      "POST",
      `/api/v1/roles/users/${userId}/assignments`,
      { roleId },
    );

    assert.equal(result.status, 201);
    assert.equal(result.body.status, "success");
    assert.equal(result.body.assignment.userId, userId);
    assert.equal(result.body.assignment.roleId, roleId);
    assert.equal(result.body.assignment.assignedBy, "507f1f77bcf86cd799439014");
    assert.equal(result.body.assignment.isActive, true);
  });

  it("rejects a malformed target user ID", async () => {
    const result = await api.request(
      "POST",
      "/api/v1/roles/users/not-an-object-id/assignments",
      { roleId },
    );

    assert.equal(result.status, 400);
    assert.equal(result.body.message, "Invalid user ID");
  });

  it("rejects an assignment without a role ID", async () => {
    const result = await api.request(
      "POST",
      `/api/v1/roles/users/${userId}/assignments`,
      {},
    );

    assert.equal(result.status, 400);
    assert.equal(result.body.message, "Invalid role ID");
  });

  it("rejects a duplicate active role assignment", async () => {
    const result = await api.request(
      "POST",
      `/api/v1/roles/users/${userId}/assignments`,
      { roleId },
      { models: makeModels({ existingAssignment: { _id: assignmentId } }) },
    );

    assert.equal(result.status, 409);
    assert.equal(result.body.message, "Role already assigned");
  });

  it("rejects an inactive role", async () => {
    const result = await api.request(
      "POST",
      `/api/v1/roles/users/${userId}/assignments`,
      { roleId },
      { models: makeModels({ roleActive: false }) },
    );

    assert.equal(result.status, 409);
    assert.equal(result.body.message, "Role is inactive");
  });

  it("rejects a user reporting to themselves", async () => {
    const result = await api.request(
      "POST",
      `/api/v1/roles/users/${userId}/assignments`,
      { roleId, reportsToUserId: userId },
    );

    assert.equal(result.status, 400);
    assert.equal(result.body.message, "User cannot report to themselves");
  });

  it("deactivates an assignment and records the revoking actor", async () => {
    const revokedAt = "2026-08-12T00:00:00.000Z";
    const result = await api.request(
      "DELETE",
      `/api/v1/roles/users/${userId}/assignments/${assignmentId}`,
      undefined,
      { models: makeModels({
        updatedAssignment: {
          _id: assignmentId,
          userId,
          isActive: false,
          deactivatedBy: "507f1f77bcf86cd799439014",
          deactivatedAt: revokedAt,
        },
      }) },
    );

    assert.equal(result.status, 200);
    assert.equal(result.body.status, "success");
    assert.equal(result.body.assignment.isActive, false);
    assert.equal(result.body.assignment.deactivatedBy, "507f1f77bcf86cd799439014");
    assert.equal(result.body.assignment.deactivatedAt, revokedAt);
  });
});
