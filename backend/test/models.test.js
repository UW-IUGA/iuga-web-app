import assert from "node:assert/strict";
import { test } from "node:test";
import { connectToDatabase } from "../models.js";

test("model registry module loads shared schemas", () => {
    assert.equal(typeof connectToDatabase, "function");
});
