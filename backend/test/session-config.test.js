import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createSessionOptions, readSessionSecret } from "../sessionConfig.js";

const appPath = fileURLToPath(new URL("../app.js", import.meta.url));

test("startup fails before database connection when the development session secret is missing", () => {
  const result = spawnSync(process.execPath, [appPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      DEPLOY_ENV: "development",
      SESSION_SECRET_DEV: "",
      DB_URI: "mongodb://127.0.0.1:1/unreachable",
    },
  });

  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.match(output, /FATAL: SESSION_SECRET_DEV not set/);
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

test("each deployment reads its own session secret and reports the variable name", () => {
  const cases = [
    ["development", "SESSION_SECRET_DEV"],
    ["staging", "SESSION_SECRET_STAGING"],
    ["production", "SESSION_SECRET_PROD"],
  ];

  for (const [deployEnv, envName] of cases) {
    const result = readSessionSecret({
      DEPLOY_ENV: deployEnv,
      [envName]: `  ${deployEnv}-secret  `,
    });

    assert.deepEqual(result, { envName, value: `${deployEnv}-secret` });
  }
});

test("an unrecognized deployment environment falls back to SESSION_SECRET", () => {
  const result = readSessionSecret({ DEPLOY_ENV: "qa", SESSION_SECRET: "fallback" });

  assert.deepEqual(result, { envName: "SESSION_SECRET", value: "fallback" });
});

test("a known deployment environment ignores the generic SESSION_SECRET fallback", () => {
  const result = readSessionSecret({ DEPLOY_ENV: "production", SESSION_SECRET: "generic" });

  assert.deepEqual(result, { envName: "SESSION_SECRET_PROD", value: null });
});

test("a missing secret reports the expected variable with no value", () => {
  const unset = readSessionSecret({ DEPLOY_ENV: "staging" });
  assert.deepEqual(unset, { envName: "SESSION_SECRET_STAGING", value: null });

  const blank = readSessionSecret({ DEPLOY_ENV: "staging", SESSION_SECRET_STAGING: "   " });
  assert.deepEqual(blank, { envName: "SESSION_SECRET_STAGING", value: null });

  const empty = readSessionSecret({ DEPLOY_ENV: "staging", SESSION_SECRET_STAGING: "" });
  assert.deepEqual(empty, { envName: "SESSION_SECRET_STAGING", value: null });
});
