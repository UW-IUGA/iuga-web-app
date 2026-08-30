import { describe, it } from "node:test";
import assert from "node:assert";
import {
  requireAuth,
  requireAdmin,
  requireOfficerRolePermission,
} from "../routes/api/v1/utils/auth.js";
import { isOwnerOrAdmin } from "../routes/api/v1/utils/auth.js";
import { makeFakeRes } from "./makeFakeRes.js";

describe("requireAuth", () => {
  it("rejects a request with no session", () => {
    // arrange
    const req = { session: {} };
    const res = makeFakeRes();
    let nextCalled = false;

    // act
    requireAuth(req, res, () => {
      nextCalled = true;
    });

    // assert
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.message, "Not authenticated");
    assert.strictEqual(nextCalled, false);
  });

  it("passes an authenticated request through", () => {
    const req = { session: { isAuthenticated: true } };
    const res = makeFakeRes();
    let nextCalled = false;

    requireAuth(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, null);
    assert.strictEqual(nextCalled, true);
  });
});

describe("requireAdmin", () => {
  it("rejects a request with no session (401, not 403)", () => {
    const req = { session: {} };
    const res = makeFakeRes();
    let nextCalled = false;

    requireAdmin(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.message, "Not authenticated");
    assert.strictEqual(nextCalled, false);
  });

  it("rejects a logged-in non-admin (403)", () => {
    const req = { session: { isAuthenticated: true, isAdmin: false } };
    const res = makeFakeRes();
    let nextCalled = false;

    requireAdmin(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.message, "Not authorized");
    assert.strictEqual(nextCalled, false);
  });

  it("passes an admin through", () => {
    const req = { session: { isAuthenticated: true, isAdmin: true } };
    const res = makeFakeRes();
    let nextCalled = false;

    requireAdmin(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, null);
    assert.strictEqual(nextCalled, true);
  });
});

describe("requireOfficerRolePermission", () => {
  function requestWithAssignments(assignments) {
    return {
      session: { isAuthenticated: true, isAdmin: true, userId: "user-1" },
      models: {
        RoleAssignments: {
          find(filter = {}) {
            const filtered = assignments.filter((assignment) => {
              if (!filter.$or) return true;
              return filter.$or.some((condition) => {
                if (condition.expiresAt === null) {
                  return (
                    assignment.expiresAt === null ||
                    assignment.expiresAt === undefined
                  );
                }
                return assignment.expiresAt > condition.expiresAt.$gt;
              });
            });
            return {
              async populate() {
                return filtered;
              },
            };
          },
        },
      },
    };
  }

  it("does not grant permissions from expired assignments", async () => {
    const req = requestWithAssignments([
      {
        expiresAt: new Date(Date.now() - 1),
        roleId: { isActive: true, permissions: ["users.roles.manage"] },
      },
    ]);
    const res = makeFakeRes();
    let nextCalled = false;

    await requireOfficerRolePermission("users.roles.manage")(
      req,
      res,
      () => {
        nextCalled = true;
      },
    );

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(nextCalled, false);
  });

  it("passes when an active role grants the permission", async () => {
    const req = requestWithAssignments([
      { roleId: { isActive: true, permissions: ["users.roles.manage"] } },
    ]);
    const res = makeFakeRes();
    let nextCalled = false;

    await requireOfficerRolePermission("users.roles.manage")(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, null);
    assert.strictEqual(nextCalled, true);
  });

  it("rejects an admin without the permission", async () => {
    const req = requestWithAssignments([
      { roleId: { isActive: true, permissions: ["events.view"] } },
    ]);
    const res = makeFakeRes();

    await requireOfficerRolePermission("users.roles.manage")(
      req,
      res,
      () => {},
    );

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.message, "Not authorized");
  });
});

describe("isOwnerOrAdmin", () => {
  it("returns true for an admin even if the record belongs to someone else", () => {
    const req = { session: { isAdmin: true, userId: "admin-1" } };
    const res = isOwnerOrAdmin(req, "other-user-not-admin");
    assert.strictEqual(res, true);
  });

  it("returns true for an admin accessing their own record", () => {
    const req = { session: { isAdmin: true, userId: "admin-1" } };
    const res = isOwnerOrAdmin(req, "admin-1");
    assert.strictEqual(res, true);
  });

  it("returns true for an owner accessing their own record", () => {
    const req = { session: { isAdmin: false, userId: "owner-1" } };
    const res = isOwnerOrAdmin(req, "owner-1");
    assert.strictEqual(res, true);
  });

  it("returns false for a user accessing someone else's record when not admin", () => {
    const req = { session: { isAdmin: false, userId: "owner-1" } };
    const res = isOwnerOrAdmin(req, "not-owner-1");
    assert.strictEqual(res, false);
  });
});
