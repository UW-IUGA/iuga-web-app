// Exercise the local MongoDB helper with isolated commands; never contact host services.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("../../scripts/start-mongodb.sh", import.meta.url));

function runHelper(t, scenario = {}) {
  const directory = mkdtempSync(join(tmpdir(), "iuga-mongodb-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const logPath = join(directory, "commands.jsonl");
  writeFileSync(logPath, "");
  const mockPath = join(directory, "mock-command");
  writeFileSync(mockPath, `#!${process.execPath}
const { appendFileSync } = require("node:fs");
const { basename } = require("node:path");
const command = basename(process.argv[1]);
const args = process.argv.slice(2);
const scenario = JSON.parse(process.env.MOCK_SCENARIO);
appendFileSync(process.env.MOCK_LOG, JSON.stringify([command, ...args]) + "\\n");
if (command === "docker") {
  if (args[0] === "info") process.exit(0);
  if (args[0] === "inspect") {
    if (!scenario.exists) process.exit(1);
    if (!args.includes("-f")) process.exit(0);
    const format = args[args.indexOf("-f") + 1];
    if (format.includes(".State.Running")) {
      console.log(scenario.running ? "true" : "false");
      process.exit(0);
    }
    if (format.includes(".HostConfig.PortBindings")) {
      if (scenario.inspectFails) process.exit(1);
      process.stdout.write(scenario.bindings ?? "127.0.0.1 27017\\n");
      process.exit(0);
    }
  }
  if (args[0] === "run" || args[0] === "start") process.exit(0);
  if (args[0] === "exec" && args[2] === "mongosh") {
    console.log("1");
    process.exit(0);
  }
}
if (command === "brew") {
  if (args.join(" ") === "services list") {
    console.log("mongodb-community started test-user");
    process.exit(0);
  }
  if (args.join(" ") === "services stop mongodb-community") process.exit(0);
}
console.error("Unexpected mock command: " + command + " " + args.join(" "));
process.exit(99);
`, { mode: 0o755 });
  for (const command of ["docker", "brew", "open", "uname", "sleep"]) {
    symlinkSync(mockPath, join(directory, command));
  }
  for (const command of ["awk", "grep", "seq"]) {
    symlinkSync(`/usr/bin/${command}`, join(directory, command));
  }
  const result = spawnSync("/bin/bash", [scriptPath], {
    encoding: "utf8",
    timeout: 10000,
    env: {
      PATH: directory,
      MOCK_LOG: logPath,
      MOCK_SCENARIO: JSON.stringify(scenario),
    },
  });
  assert.ifError(result.error);
  const commands = readFileSync(logPath, "utf8").trim().split("\n").map(JSON.parse);
  return { ...result, commands };
}

test("new MongoDB containers publish only on IPv4 loopback and pass the readiness ping", (t) => {
  const result = runHelper(t);
  assert.equal(result.status, 0, result.stderr);
  const run = result.commands.find(([command, action]) => command === "docker" && action === "run");
  assert.ok(run, "creates a container");
  assert.equal(run[run.indexOf("-p") + 1], "127.0.0.1:27017:27017");
  assert.ok(result.commands.some(([command, action]) => command === "docker" && action === "exec"));
  assert.match(result.stdout, /MongoDB ready on 127\.0\.0\.1:27017/);
});

for (const running of [false, true]) {
  test(`an existing ${running ? "running" : "stopped"} wildcard-bound MongoDB container is rejected without state changes`, (t) => {
    const result = runHelper(t, {
      exists: true,
      running,
      bindings: "0.0.0.0 27017\n:: 27017\n",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /iuga-mongo.*(?:unsafe|not restricted)/);
    assert.match(result.stderr, /back.?up|backup/i);
    assert.match(result.stderr, /preserve.*data/i);
    assert.match(result.stderr, /manually.*127\.0\.0\.1:27017:27017/);
    assert.doesNotMatch(result.stdout, /MongoDB ready/);
    assert.ok(result.commands.every(([command, action]) => command === "docker" && ["info", "inspect"].includes(action)));
  });

  test(`an existing loopback-bound MongoDB container is ${running ? "reused" : "started"} without replacement`, (t) => {
    const result = runHelper(t, { exists: true, running });
    assert.equal(result.status, 0, result.stderr);
    const dockerActions = result.commands.filter(([command]) => command === "docker").map(([, action]) => action);
    assert.equal(dockerActions.filter((action) => action === "start").length, running ? 0 : 1);
    assert.ok(dockerActions.every((action) => ["info", "inspect", "start", "exec"].includes(action)));
    assert.match(result.stdout, /MongoDB ready on 127\.0\.0\.1:27017/);
  });
}

for (const [name, scenario] of [
  ["IPv6 wildcard", { bindings: ":: 27017\n" }],
  ["unspecified host address", { bindings: " 27017\n" }],
  ["non-loopback host address", { bindings: "192.0.2.1 27017\n" }],
  ["loopback plus wildcard", { bindings: "127.0.0.1 27017\n0.0.0.0 27017\n" }],
  ["wrong host port", { bindings: "127.0.0.1 27018\n" }],
  ["missing binding", { bindings: "" }],
  ["failed binding inspection", { inspectFails: true }],
]) {
  test(`${name} cannot be reported as a safe local MongoDB container`, (t) => {
    const result = runHelper(t, { exists: true, running: true, ...scenario });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /unsafe or missing MongoDB port bindings/);
    assert.doesNotMatch(result.stdout, /MongoDB ready/);
    assert.ok(result.commands.every(([command, action]) => command === "docker" && ["info", "inspect"].includes(action)));
  });
}
