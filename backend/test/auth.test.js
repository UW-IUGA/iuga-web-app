import { describe, it } from "node:test";
import assert from "node:assert";
import {
  requireAuth,
  requireAdmin,
  requirePermission,
} from "../routes/api/v1/utils/auth.js";
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

describe("requirePermission", () => {
  const activeCycle = {
    _id: "cycle-2026",
    cycleKey: "2026-2027",
    startsAt: new Date("2026-09-01T00:00:00Z"),
    endsAt: new Date("2027-09-01T00:00:00Z"),
    status: "active",
  };

  function requestWithAssignments(assignments, cycle = activeCycle) {
    return {
      session: { isAuthenticated: true, isAdmin: false, userId: "user-1" },
      models: {
        Cycles: {
          findOne() {
            return {
              async lean() {
                return cycle;
              },
            };
          },
        },
        RoleAssignments: {
          find() {
            return {
              async populate() {
                return assignments;
              },
            };
          },
        },
      },
    };
  }

  it("passes when an active role grants the permission", async () => {
    const req = requestWithAssignments([
      { roleId: { isActive: true, permissions: ["users.roles.manage"] } },
    ]);
    const res = makeFakeRes();
    let nextCalled = false;

    await requirePermission("users.roles.manage")(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, null);
    assert.strictEqual(nextCalled, true);
  });

  it("passes for a non-admin user with an active role permission", async () => {
    const req = requestWithAssignments([
      { roleId: { isActive: true, permissions: ["events.view"] } },
      { roleId: { isActive: true, permissions: ["users.roles.manage"] } },
    ]);
    const res = makeFakeRes();
    let nextCalled = false;

    await requirePermission("users.roles.manage")(req, res, () => {
      nextCalled = true;
    });

    assert.strictEqual(res.statusCode, null);
    assert.strictEqual(nextCalled, true);
  });

  it("ignores permissions from expired role assignments", async () => {
    const req = requestWithAssignments([
      {
        expiresAt: new Date(Date.now() - 1000),
        roleId: { isActive: true, permissions: ["users.roles.manage"] },
      },
    ]);
    const res = makeFakeRes();

    await requirePermission("users.roles.manage")(req, res, () => {});

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.message, "Not authorized");
  });

  it("ignores permissions from assignments in another academic year", async () => {
    const req = requestWithAssignments([
      {
        cycleId: "cycle-2025",
        roleId: { isActive: true, permissions: ["users.roles.manage"] },
      },
    ]);
    const res = makeFakeRes();

    await requirePermission("users.roles.manage")(req, res, () => {});

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.message, "Not authorized");
  });

  it("rejects permission checks when no academic year is active", async () => {
    const req = requestWithAssignments([
      { roleId: { isActive: true, permissions: ["users.roles.manage"] } },
    ], null);
    const res = makeFakeRes();

    await requirePermission("users.roles.manage")(req, res, () => {});

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.message, "Not authorized");
  });

  it("rejects an admin without the permission", async () => {
    const req = requestWithAssignments([
      { roleId: { isActive: true, permissions: ["events.view"] } },
    ]);
    const res = makeFakeRes();

    await requirePermission("users.roles.manage")(req, res, () => {});

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.body.message, "Not authorized");
  });

  it("allows preview permissions for authenticated users in local preview mode", async () => {
    const previousEnvironment = process.env.DEPLOY_ENV;
    const previousPreview = process.env.ADMIN_PREVIEW;
    process.env.DEPLOY_ENV = "development";
    process.env.ADMIN_PREVIEW = "true";

    try {
      const req = requestWithAssignments([], null);
      const res = makeFakeRes();
      let nextCalled = false;

      await requirePermission("dashboard.read")(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, null);
      assert.strictEqual(nextCalled, true);
    } finally {
      if (previousEnvironment === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = previousEnvironment;
      if (previousPreview === undefined) delete process.env.ADMIN_PREVIEW;
      else process.env.ADMIN_PREVIEW = previousPreview;
    }
  });

  it("does not grant unrelated mutation permissions in local preview mode", async () => {
    const previousEnvironment = process.env.DEPLOY_ENV;
    const previousPreview = process.env.ADMIN_PREVIEW;
    process.env.DEPLOY_ENV = "development";
    process.env.ADMIN_PREVIEW = "true";

    try {
      const req = requestWithAssignments([], null);
      const res = makeFakeRes();

      await requirePermission("events.finance.manage")(req, res, () => {});

      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.message, "Not authorized");
    } finally {
      if (previousEnvironment === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = previousEnvironment;
      if (previousPreview === undefined) delete process.env.ADMIN_PREVIEW;
      else process.env.ADMIN_PREVIEW = previousPreview;
    }
  });

  it("allows event request creation in local preview mode", async () => {
    const previousEnvironment = process.env.DEPLOY_ENV;
    const previousPreview = process.env.ADMIN_PREVIEW;
    process.env.DEPLOY_ENV = "development";
    process.env.ADMIN_PREVIEW = "true";

    try {
      const req = requestWithAssignments([], null);
      const res = makeFakeRes();
      let nextCalled = false;

      await requirePermission("events.requests.create")(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(res.statusCode, null);
      assert.strictEqual(nextCalled, true);
    } finally {
      if (previousEnvironment === undefined) delete process.env.DEPLOY_ENV;
      else process.env.DEPLOY_ENV = previousEnvironment;
      if (previousPreview === undefined) delete process.env.ADMIN_PREVIEW;
      else process.env.ADMIN_PREVIEW = previousPreview;
    }
  });
});
