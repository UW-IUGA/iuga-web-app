import assert from "node:assert/strict";
import { describe, it } from "node:test";
import mongoose from "mongoose";
import { shopProductLimitsSchema } from "../schemas/schemas.js";

const ShopProductLimits = mongoose.model("ShopProductLimitsSchemaCheck", shopProductLimitsSchema);

describe("shop product limit documents", () => {
  it("require an explicit perStudentLimit, so the database never holds its own default", () => {
    const error = new ShopProductLimits({ sku: "info-crewneck" }).validateSync();
    assert.ok(error?.errors.perStudentLimit);
  });

  it("reject a limit below 1", () => {
    const error = new ShopProductLimits({ sku: "info-crewneck", perStudentLimit: 0 }).validateSync();
    assert.ok(error?.errors.perStudentLimit);
  });

  it("accept an explicit limit", () => {
    assert.equal(new ShopProductLimits({ sku: "info-crewneck", perStudentLimit: 5 }).validateSync(), undefined);
  });
});
