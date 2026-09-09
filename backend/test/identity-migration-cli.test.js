import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile as writeTempFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildReport } from "../identityMigrationReport.js";
import {
  loadUsers,
  runReport,
  writeReport,
} from "../scripts/report-identity-migration.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const scriptPath = fileURLToPath(new URL("../scripts/report-identity-migration.js", import.meta.url));
const issuer = "https://issuer.example";
const identity = (objectId) => ({ issuer, tenantId: "tenant-a", objectId });
const users = [
  { _id: "u-1", uEmail: "alice@example.edu", identity: identity("oid-1") },
  { _id: "u-2", uEmail: "alice@example.edu", identity: null },
  { _id: "u-3", uEmail: "bob@example.edu", identity: { issuer, tenantId: "tenant-a" } },
  { _id: "u-4", uEmail: "carol@example.edu", identity: identity("oid-4") },
  { _id: "u-5", uEmail: "dave@example.edu", identity: identity("oid-5") },
  { _id: "u-6", uEmail: "erin@example.edu", identity: null },
];
const directory = [
  { userId: "u-1", ...identity("oid-1") },
  { email: "alice@example.edu", ...identity("oid-2") },
  { userId: "u-3", issuer, tenantId: "tenant-a" },
  { userId: "u-4", ...identity("oid-shared") },
  { userId: "u-5", ...identity("oid-shared") },
  { userId: "u-5", ...identity("oid-other") },
  { userId: "u-unknown", ...identity("oid-unknown") },
  { userId: "u-6", ...identity("oid-6") },
  { userId: "u-1", ...identity("oid-1") },
];

function reportFor() {
  return buildReport({ users, directory });
}

describe("identity migration report output", () => {
  let tempRoot;
  test.beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), "iuga-identity-report-"));
  });
  test.afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  test("writes JSON only to an absolute operator-selected path with mode 0600", async () => {
    const outputPath = path.join(tempRoot, "migration.json");
    const report = reportFor();
    await writeReport(report, outputPath, { repositoryRoot });
    assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), report);
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  });

  test("refuses relative paths and paths inside the repository", async () => {
    await assert.rejects(() => writeReport(reportFor(), "migration.json", { repositoryRoot }), /absolute/i);
    await assert.rejects(
      () => writeReport(reportFor(), path.join(repositoryRoot, "backend", "migration.json"), { repositoryRoot }),
      /outside|repository/i,
    );
  });

  test("refuses to overwrite an existing output file", async () => {
    const outputPath = path.join(tempRoot, "existing.json");
    await writeTempFile(outputPath, "operator data", { mode: 0o600 });
    await assert.rejects(() => writeReport(reportFor(), outputPath, { repositoryRoot }), /exist|overwrite/i);
    assert.equal(await readFile(outputPath, "utf8"), "operator data");
  });

  test("does not leave an output file when the report cannot be serialized", async () => {
    const outputPath = path.join(tempRoot, "invalid.json");
    const circularReport = {};
    circularReport.self = circularReport;

    await assert.rejects(
      () => writeReport(circularReport, outputPath, { repositoryRoot }),
      /circular|serialize/i,
    );
    await assert.rejects(() => stat(outputPath), { code: "ENOENT" });
  });
});

describe("identity migration report command", () => {
  test("reads users through a connection that cannot auto-create indexes", async () => {
    const calls = [];
    const expectedUsers = [{ _id: "u-1", uEmail: "user@example.edu" }];
    const connection = {
      async asPromise() {
        calls.push(["asPromise"]);
        return this;
      },
      collection(name) {
        calls.push(["collection", name]);
        return {
          find(filter, options) {
            calls.push(["find", filter, options]);
            return { toArray: async () => expectedUsers };
          },
        };
      },
      async close() {
        calls.push(["close"]);
      },
    };

    const result = await loadUsers("mongodb://database.example/iuga", {
      createConnection(uri, options) {
        calls.push(["createConnection", uri, options]);
        return connection;
      },
    });

    assert.deepEqual(result, expectedUsers);
    assert.deepEqual(calls, [
      ["createConnection", "mongodb://database.example/iuga", {
        autoCreate: false,
        autoIndex: false,
      }],
      ["asPromise"],
      ["collection", "users"],
      ["find", {}, { projection: { _id: 1, uEmail: 1, identity: 1 } }],
      ["close"],
    ]);
  });

  test("closes the read-only connection when its handshake fails", async () => {
    let closed = false;
    const connection = {
      async asPromise() {
        throw new Error("credential must not escape");
      },
      async close() {
        closed = true;
      },
    };

    await assert.rejects(
      () => loadUsers("mongodb://database.example/iuga", {
        createConnection: () => connection,
      }),
      (error) => {
        assert.equal(error.reportCode, "database_unavailable");
        assert.doesNotMatch(error.message, /credential must not escape/);
        return true;
      },
    );
    assert.equal(closed, true);
  });

  test("orchestrates directory input, read-only loading, and report output", async () => {
    const calls = [];
    const outputPath = path.join(os.tmpdir(), "operator-report.json");
    const result = await runReport({
      argv: ["--directory", "/operator/directory.json", "--output", outputPath],
      env: { DB_URI: "mongodb://database.example/iuga" },
      repositoryRoot,
      dependencies: {
        async readDirectory(inputPath) {
          calls.push(["readDirectory", inputPath]);
          return directory;
        },
        async loadUsers(dbUri) {
          calls.push(["loadUsers", dbUri]);
          return users;
        },
        async writeReport(report, target, options) {
          calls.push(["writeReport", target, options, report.counts]);
        },
      },
    });

    assert.deepEqual(result, {
      users: 6,
      mappings: 1,
      reviewHolds: 6,
    });
    assert.deepEqual(calls, [
      ["readDirectory", "/operator/directory.json"],
      ["loadUsers", "mongodb://database.example/iuga"],
      ["writeReport", outputPath, { repositoryRoot }, {
        users: 6,
        emailGroups: 5,
        emailCollisions: 1,
        directoryRows: 9,
        completeMappings: 1,
        reviewHolds: 6,
        duplicateRows: 1,
      }],
    ]);
  });

  test("reports a safe actionable code for malformed directory input", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "iuga-identity-cli-"));
    try {
      const directoryPath = path.join(tempRoot, "directory.json");
      const outputPath = path.join(tempRoot, "report.json");
      const secret = "must-not-appear";
      await writeTempFile(directoryPath, `{${secret}`, { mode: 0o600 });

      const result = spawnSync(
        process.execPath,
        [scriptPath, "--directory", directoryPath, "--output", outputPath],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            DB_URI: `mongodb://user:${secret}@database.example/iuga`,
          },
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      assert.notEqual(result.status, 0);
      assert.match(output, /directory_input_invalid/);
      assert.doesNotMatch(output, new RegExp(secret, "u"));
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
