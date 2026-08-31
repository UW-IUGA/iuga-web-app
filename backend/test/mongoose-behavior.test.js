import assert from "node:assert/strict";
import mongoose from "mongoose";
import { test } from "node:test";

test("Mongoose 6 strips unknown query fields by default", () => {
  const schema = new mongoose.Schema({ name: String });
  const Model = mongoose.model("MongooseUpgradeStrictQueryBaseline", schema);
  const query = Model.find({ fieldRemovedFromSchema: "value" });

  query.cast(Model);

  assert.deepEqual(query.getFilter(), {});
});
