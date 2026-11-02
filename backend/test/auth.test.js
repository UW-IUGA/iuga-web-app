import { describe, it } from "node:test";
import assert from "node:assert";
import {
  requireAuth,
  requirePermission,
  permissionsOf,
  isOwnerOrPermitted,
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

const signedIn = { isAuthenticated: true, userId: "user-1" };
const role = (permissions, isActive = true) => ({ roleId: { isActive, permissions } });

// A request from `session` whose role assignments are `assignments`. The fake applies the
// expiry filter the module sends, so expired assignments drop out as they would in MongoDB.
function requestWith(session, assignments = []) {
  let queried = false;
  return {
    get queried() {
      return queried;
    },
    session,
    models: {
      RoleAssignments: {
        find(filter = {}) {
          queried = true;
          const current = assignments.filter((assignment) =>
            (filter.$or ?? [{ expiresAt: null }]).some((condition) =>
              condition.expiresAt === null
                ? assignment.expiresAt == null
                : assignment.expiresAt > condition.expiresAt.$gt,
            ),
          );
          return {
            async populate() {
              return current;
            },
          };
        },
      },
    },
  };
}

// Runs a permission middleware and reports the status it sent (null when it passed the request on).
async function run(middleware, req) {
  const res = makeFakeRes();
  let passed = false;
  await middleware(req, res, () => {
    passed = true;
  });
  return { status: res.statusCode, message: res.body?.message, passed };
}

describe("permissionsOf", () => {
  it("collects permissions from every active, unexpired assignment to an active role", async () => {
    const req = requestWith(signedIn, [
      role(["shop.purchases.review"]),
      role(["events.finance.manage", "shop.purchases.review"]),
      { expiresAt: new Date(Date.now() - 1), ...role(["users.roles.manage"]) },
      role(["feedback.manage"], false),
    ]);

    assert.deepStrictEqual(
      [...(await permissionsOf(req))].sort(),
      ["events.finance.manage", "shop.purchases.review"],
    );
  });

  it("ignores names the site does not define", async () => {
    const req = requestWith(signedIn, [role(["events.view", "shop.purchases.review"])]);
    assert.deepStrictEqual([...(await permissionsOf(req))], ["shop.purchases.review"]);
  });

  it("is empty for a signed-out visitor, without reading role assignments", async () => {
    const req = requestWith({}, [role(["shop.purchases.review"])]);
    assert.strictEqual((await permissionsOf(req)).size, 0);
    assert.strictEqual(req.queried, false);
  });
});

describe("requirePermission", () => {
  it("refuses a signed-out visitor with 401", async () => {
    const result = await run(requirePermission("users.roles.manage"), requestWith({}));
    assert.deepStrictEqual(result, { status: 401, message: "Not authenticated", passed: false });
  });

  it("refuses a signed-in user without the permission with 403", async () => {
    const req = requestWith(signedIn, [role(["events.finance.manage"])]);
    const result = await run(requirePermission("users.roles.manage"), req);
    assert.deepStrictEqual(result, { status: 403, message: "Not authorized", passed: false });
  });

  it("passes a user whose role grants the permission, whatever their account type", async () => {
    const req = requestWith({ ...signedIn, memberType: "Member" }, [role(["users.roles.manage"])]);
    const result = await run(requirePermission("users.roles.manage"), req);
    assert.deepStrictEqual(result, { status: null, message: undefined, passed: true });
  });

  it("refuses an Admin account that holds no role", async () => {
    const req = requestWith({ ...signedIn, memberType: "Admin", isAdmin: true });
    const result = await run(requirePermission("users.roles.manage"), req);
    assert.strictEqual(result.status, 403);
  });

  it("answers 500 instead of granting access when role lookup fails", async (t) => {
    t.mock.method(console, "error", () => {});
    const req = {
      session: signedIn,
      models: { RoleAssignments: { find() { throw new Error("database unavailable"); } } },
    };
    const result = await run(requirePermission("users.roles.manage"), req);
    assert.deepStrictEqual(result, { status: 500, message: "There was an error on our side :(", passed: false });
  });

  it("refuses to build a check for a name the site does not define", () => {
    assert.throws(() => requirePermission("users.role.manage"), /Unknown permission "users.role.manage"/);
  });
});

describe("isOwnerOrPermitted", () => {
  const permission = "events.participants.manage";

  it("allows the owner without reading role assignments", async () => {
    const req = requestWith(signedIn);
    assert.strictEqual(await isOwnerOrPermitted(req, "user-1", permission), true);
    assert.strictEqual(req.queried, false);
  });

  it("allows someone else only with the permission", async () => {
    assert.strictEqual(await isOwnerOrPermitted(requestWith(signedIn), "user-2", permission), false);
    assert.strictEqual(
      await isOwnerOrPermitted(requestWith(signedIn, [role([permission])]), "user-2", permission),
      true,
    );
  });

  it("never treats a record without an owner as the session's own", async () => {
    const req = requestWith({ isAuthenticated: true });
    assert.strictEqual(await isOwnerOrPermitted(req, undefined, permission), false);
  });
});
