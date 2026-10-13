import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";

const script = readFileSync(new URL("../../scripts/start-replica-set-mongodb.sh", import.meta.url), "utf8");

it("provisions separate replica-set databases for checkouts and reuses each on restart", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "shop-replset-startup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  mkdirSync(bin);
  const stateFile = path.join(root, "docker.json");
  writeFileSync(stateFile, "{}");
  writeFileSync(path.join(bin, "docker"), `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
const file = process.env.DOCKER_STUB_STATE;
const state = JSON.parse(fs.readFileSync(file, "utf8"));
switch (args[0]) {
  case "info": break;
  case "inspect":
    if (!state[args.at(-1)]) process.exit(1);
    if (args.includes("--format")) console.log("true");
    break;
  case "run": {
    const name = args[args.indexOf("--name") + 1];
    if (state[name]) process.exit(1);
    const binding = args[args.indexOf("-p") + 1];
    const hostPort = binding.split(":")[1] || String(31000 + Object.keys(state).length);
    state[name] = { binding, hostPort };
    fs.writeFileSync(file, JSON.stringify(state));
    console.log(name);
    break;
  }
  case "port": console.log("127.0.0.1:" + state[args[1]].hostPort); break;
  case "exec": console.log(args.at(-1).includes("isWritablePrimary") ? "true" : "1"); break;
  default: process.exit(2);
}
`, { mode: 0o755 });

  function start(checkout) {
    const result = spawnSync("/bin/bash", [path.join(checkout, "scripts/start-replica-set-mongodb.sh")], {
      encoding: "utf8",
      env: { PATH: `${bin}:${process.env.PATH}`, DOCKER_STUB_STATE: stateFile },
    });
    assert.equal(result.status, 0, result.stderr);
    return Object.fromEntries(result.stdout.split("\n").filter((line) => /^(DB_URI|SHOP_REPLSET_URI)=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  }

  const checkouts = ["first", "second"].map((name) => {
    const checkout = path.join(root, name);
    mkdirSync(path.join(checkout, "scripts"), { recursive: true });
    writeFileSync(path.join(checkout, "scripts/start-replica-set-mongodb.sh"), script);
    return checkout;
  });
  const first = start(checkouts[0]);
  const second = start(checkouts[1]);
  assert.notEqual(first.DB_URI, second.DB_URI, "worktrees must not share the application database");
  assert.notEqual(first.SHOP_REPLSET_URI, second.SHOP_REPLSET_URI);
  assert.deepEqual(start(checkouts[0]), first, "restart must preserve this checkout's database");
  const containers = JSON.parse(readFileSync(stateFile, "utf8"));
  assert.equal(Object.keys(containers).length, 2);
  assert.ok(!containers["iuga-mongo-replset"], "must not reuse or change the old shared database");
  for (const container of Object.values(containers)) {
    assert.equal(container.binding.split(":")[0], "127.0.0.1", "local databases must not be exposed on the network");
  }
  for (const settings of [first, second]) {
    assert.ok(new URL(settings.DB_URI).searchParams.get("replicaSet"));
    assert.ok(new URL(settings.SHOP_REPLSET_URI).searchParams.get("replicaSet"));
    assert.equal(new URL(settings.DB_URI).searchParams.get("directConnection"), "true");
  }
});
