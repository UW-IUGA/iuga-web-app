import assert from "node:assert/strict";
import mongoose from "mongoose";
import "../models.js";
import { test } from "node:test";

test("backend strips unknown query fields consistently", () => {
  const modelName = "MongooseUpgradeStrictQueryBaseline";
  const schema = new mongoose.Schema({ name: String });
  const Model = mongoose.model(modelName, schema);
  const query = Model.find({ fieldRemovedFromSchema: "value" });

  try {
    query.cast(Model);
    assert.deepEqual(query.getFilter(), {});
  } finally {
    mongoose.deleteModel(modelName);
  }
});
