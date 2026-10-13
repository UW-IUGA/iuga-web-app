import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  currentLimits,
  invalidateLimits,
  LIMIT_CACHE_MS,
  limitCacheMs,
  limitFor,
} from "../routes/api/v1/utils/shopLimits.js";

const T0 = Date.parse("2026-10-12T21:00:00Z");

function fakeModels({ defaultDoc = null, products = [] } = {}) {
  return {
    ShopLimitDefault: {
      findOne() {
        return { lean: async () => defaultDoc };
      },
    },
    ShopProductLimits: {
      find() {
        return { lean: async () => products };
      },
    },
  };
}

describe("shop limits", () => {
  beforeEach(() => {
    invalidateLimits();
  });

  it("uses the default stored in the database, and a product's own limit over it", async () => {
    const models = fakeModels({
      defaultDoc: { perStudentLimit: 4 },
      products: [{ sku: "info-hoodie", perStudentLimit: 2 }],
    });

    const limits = await currentLimits(models, T0);

    assert.equal(limitFor(limits, "info-hoodie"), 2);
    assert.equal(limitFor(limits, "info-tote-bag"), 4);
  });

  it("falls back to the code default when the database has no default document", async () => {
    const limits = await currentLimits(fakeModels(), T0);

    assert.equal(limitFor(limits, "info-tote-bag"), 5);
  });

  it("keeps the current limit until the cache window ends", async () => {
    const defaultDoc = { perStudentLimit: 4 };
    const models = fakeModels({ defaultDoc });

    await currentLimits(models, T0);
    defaultDoc.perStudentLimit = 6;

    assert.equal(limitFor(await currentLimits(models, T0 + 1000), "info-hoodie"), 4);
    assert.equal(limitFor(await currentLimits(models, T0 + LIMIT_CACHE_MS - 1), "info-hoodie"), 4);
  });

  it("applies a changed limit once the cache window ends", async () => {
    const defaultDoc = { perStudentLimit: 4 };
    const models = fakeModels({ defaultDoc });

    await currentLimits(models, T0);
    defaultDoc.perStudentLimit = 6;

    assert.equal(limitFor(await currentLimits(models, T0 + LIMIT_CACHE_MS), "info-hoodie"), 6);
  });

  it("applies a changed limit immediately after invalidation", async () => {
    const defaultDoc = { perStudentLimit: 4 };
    const models = fakeModels({ defaultDoc });

    await currentLimits(models, T0);
    defaultDoc.perStudentLimit = 6;
    invalidateLimits();

    assert.equal(limitFor(await currentLimits(models, T0 + 1000), "info-hoodie"), 6);
  });

  it("does not cache a read that started before invalidateLimits, so a change is never hidden", async () => {
    let releaseDefault;
    const models = fakeModels();
    models.ShopLimitDefault.findOne = () => ({
      lean: () => new Promise((resolve) => {
        releaseDefault = () => resolve({ perStudentLimit: 3 });
      }),
    });
    const pending = currentLimits(models, T0);

    invalidateLimits();
    releaseDefault();
    await pending;

    models.ShopLimitDefault.findOne = () => ({ lean: async () => ({ perStudentLimit: 6 }) });
    const limits = await currentLimits(models, T0 + 1000);
    assert.equal(limits.defaultLimit, 6);
  });

  it("reads SHOP_LIMIT_CACHE_SECONDS, with 60 seconds by default, and rejects bad values", () => {
    assert.equal(limitCacheMs(undefined), 60000);
    assert.equal(limitCacheMs(""), 60000);
    assert.equal(limitCacheMs("0"), 0);
    assert.equal(limitCacheMs("15"), 15000);
    assert.throws(() => limitCacheMs("-1"), /SHOP_LIMIT_CACHE_SECONDS/);
    assert.throws(() => limitCacheMs("soon"), /SHOP_LIMIT_CACHE_SECONDS/);
  });
});
