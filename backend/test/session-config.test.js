import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createSessionOptions } from "../sessionConfig.js";

const appPath = fileURLToPath(new URL("../app.js", import.meta.url));

test("startup fails before database connection when SESSION_SECRET is missing", () => {
  const result = spawnSync(process.execPath, [appPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      SESSION_SECRET: "",
      DB_URI: "mongodb://127.0.0.1:1/unreachable",
    },
  });

  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /FATAL: SESSION_SECRET not set/);
  assert.doesNotMatch(output, /\[startup\] connecting to mongodb/);
});

test("development sessions use explicit non-secure cookie settings", () => {
  const options = createSessionOptions("development-secret", "development");

  assert.equal(options.secret, "development-secret");
  assert.equal(options.saveUninitialized, false);
  assert.equal(options.resave, false);
  assert.deepEqual(options.cookie, {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  });
});

test("staging and production sessions use secure cookies", () => {
  for (const deployEnv of ["staging", "production"]) {
    const options = createSessionOptions(`${deployEnv}-secret`, deployEnv);

    assert.equal(options.secret, `${deployEnv}-secret`);
    assert.equal(options.cookie.httpOnly, true);
    assert.equal(options.cookie.secure, true);
    assert.equal(options.cookie.sameSite, "lax");
  }
});
