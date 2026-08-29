import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import cyclesRouter from "../routes/api/v1/controllers/cycles.js";
import { makeTestApi } from "./testApi.js";

const activeCycle = {
  _id: "507f1f77bcf86cd799439011",
  status: "active",
  startsAt: new Date("2026-09-01T00:00:00Z"),
  endsAt: new Date("2027-09-01T00:00:00Z"),
};

function permissionsFor(names) {
  return {
    find() {
      return {
        async populate() {
          return [{ cycleId: activeCycle._id, roleId: { isActive: true, permissions: names } }];
        },
      };
    },
  };
}

function makeModels(permissions = []) {
  return {
    Cycles: {
      findOne() {
        return { async lean() { return activeCycle; } };
      },
      find() {
        return { sort() { return this; }, async lean() { return [activeCycle]; } };
      },
      async create(fields) {
        return { _id: activeCycle._id, ...fields };
      },
      async findOneAndUpdate(_filter, update) {
        return { ...activeCycle, ...update.$set };
      },
    },
    RoleAssignments: permissionsFor(permissions),
  };
}

describe("academic cycle API", () => {
  let api;

  before(async () => {
    api = await makeTestApi({
      router: cyclesRouter,
      mountPath: "/api/v1/cycles",
      models: makeModels(["users.cycles.manage", "cycles.archive"]),
      session: { isAuthenticated: true, userId: "507f1f77bcf86cd799439012" },
    });
  });

  after(async () => {
    await api.close();
  });

  it("creates an academic-year cycle with an explicit date boundary", async () => {
    const result = await api.request("POST", "/api/v1/cycles", {
      cycleKey: "2026-2027",
      cycleName: "Academic year 2026–2027",
      startsAt: "2026-09-01T00:00:00Z",
      endsAt: "2027-09-01T00:00:00Z",
      budgetTotalCents: 250000,
    });

    assert.equal(result.status, 201);
    assert.equal(result.body.cycle.cycleKey, "2026-2027");
    assert.equal(result.body.cycle.budgetTotalCents, 250000);
    assert.equal(result.body.cycle.createdBy, "507f1f77bcf86cd799439012");
  });

  it("rejects a cycle whose end is not after its start", async () => {
    const result = await api.request("POST", "/api/v1/cycles", {
      cycleKey: "invalid",
      cycleName: "Invalid cycle",
      startsAt: "2027-09-01T00:00:00Z",
      endsAt: "2027-09-01T00:00:00Z",
    });

    assert.equal(result.status, 400);
    assert.equal(result.body.message, "endsAt must be a valid date after startsAt");
  });

  it("closes an academic year with the archival actor and timestamp", async () => {
    const result = await api.request("PATCH", `/api/v1/cycles/${activeCycle._id}/close`);

    assert.equal(result.status, 200);
    assert.equal(result.body.cycle.status, "closed");
    assert.equal(result.body.cycle.closedBy, "507f1f77bcf86cd799439012");
  });
});
