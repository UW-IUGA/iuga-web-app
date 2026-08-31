import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanupTestDatabase,
  getTestDatabaseUri,
} from "./mongoose-test-db.js";

test("integration tests require an explicit TEST_DB_URI", () => {
  const previousUri = process.env.TEST_DB_URI;
  delete process.env.TEST_DB_URI;

  try {
    assert.throws(
      () => getTestDatabaseUri(),
      /TEST_DB_URI is required for Mongoose integration tests/,
    );
  } finally {
    if (previousUri === undefined) delete process.env.TEST_DB_URI;
    else process.env.TEST_DB_URI = previousUri;
  }
});

test("database cleanup disconnects when dropping the test database fails", async () => {
  const cleanupError = new Error("database disappeared");
  let disconnectCalled = false;
  const mongoose = {
    connection: {
      readyState: 1,
      async dropDatabase() {
        throw cleanupError;
      },
    },
    async disconnect() {
      disconnectCalled = true;
      this.connection.readyState = 0;
    },
  };

  await assert.rejects(
    cleanupTestDatabase(mongoose),
    (error) => error === cleanupError,
  );
  assert.equal(disconnectCalled, true);
});
