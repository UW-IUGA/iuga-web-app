import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const expectedModelNames = [
  "Events",
  "Participants",
  "Users",
  "Feedback",
  "Roles",
  "RoleAssignments",
  "EventRequests",
  "EventReviews",
];

test("clean backend install uses one Mongoose runtime for model registration", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "iuga-mongoose-runtime-"));

  try {
    await cp(new URL("../package.json", import.meta.url), join(temporaryRoot, "package.json"));
    await cp(
      new URL("../package-lock.json", import.meta.url),
      join(temporaryRoot, "package-lock.json"),
    );
    await cp(new URL("../models.js", import.meta.url), join(temporaryRoot, "models.js"));
    await cp(
      new URL("../schemas", import.meta.url),
      join(temporaryRoot, "schemas"),
      {
        recursive: true,
        filter: (source) => !source.includes("node_modules"),
      },
    );

    await execFileAsync("npm", ["ci", "--ignore-scripts"], {
      cwd: temporaryRoot,
    });

    const smokeScript = join(temporaryRoot, "runtime-smoke.mjs");
    await writeFile(
      smokeScript,
      `import assert from "node:assert/strict";
import { createRequire } from "node:module";
import mongoose from "mongoose";
import { connectToDatabase, models } from "./models.js";

const backendRequire = createRequire(import.meta.url);
const schemaRequire = createRequire(new URL("./schemas/schemas.js", import.meta.url));
assert.equal(schemaRequire.resolve("mongoose"), backendRequire.resolve("mongoose"));
assert.equal(schemaRequire("mongoose"), mongoose);

mongoose.connect = async () => mongoose;
mongoose.model = (name, schema) => {
  assert.equal(schema.base, mongoose);
  return { modelName: name, schema };
};
process.env.DB_URI = "mongodb://clean-install.invalid/iuga";
await connectToDatabase();
assert.deepEqual(Object.keys(models).sort(), ${JSON.stringify(expectedModelNames.sort())});
assert.ok(Object.values(models).every(({ schema }) => schema.base === mongoose));
`,
    );

    await execFileAsync(process.execPath, [smokeScript], {
      cwd: temporaryRoot,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
