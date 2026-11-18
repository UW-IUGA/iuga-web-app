import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { it } from "node:test";

const backendDir = fileURLToPath(new URL("..", import.meta.url));
const startupScript = readFileSync(new URL("../../scripts/start-backend.sh", import.meta.url), "utf8");
const dotenvCli = path.join(backendDir, "node_modules/dotenv-cli/cli.js");

const cases = [
  { setting: "SHOP_MANUAL_CHECKOUT_EXPOSED=true", enabled: "true" },
  { setting: 'SHOP_MANUAL_CHECKOUT_EXPOSED="true"', enabled: "true" },
  { setting: "SHOP_MANUAL_CHECKOUT_EXPOSED=true # enable checkout", enabled: "true" },
  { setting: "SHOP_MANUAL_CHECKOUT_EXPOSED=false", inherited: "true", enabled: "true" },
  { setting: "SHOP_MANUAL_CHECKOUT_EXPOSED=true", inherited: "false", enabled: "false" },
  { setting: "", enabled: undefined },
];
for (const { setting, inherited, enabled } of cases) {
  it(`uses the replica set and passes the resolved checkout setting through: ${setting || "unset"}, inherited ${inherited || "unset"}`, (t) => {
    const root = mkdtempSync(path.join(tmpdir(), "shop-startup-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(path.join(root, "scripts"));
    mkdirSync(path.join(root, "backend"));
    mkdirSync(path.join(root, "backend/bin"));
    mkdirSync(path.join(root, "bin"));
    writeFileSync(path.join(root, "scripts/start-backend.sh"), startupScript);
    for (const [script, database] of [["start-mongodb.sh", "standalone"], ["start-replica-set-mongodb.sh", "replica-set"]]) {
      writeFileSync(path.join(root, "scripts", script), `printf 'DB_URI=mongodb://127.0.0.1/${database}\\n'\n`);
    }
    const envFile = path.join(root, "checkout.env");
    writeFileSync(envFile, `${setting}\nDB_URI=mongodb://copied-env/shared\n`);
    // Use the installed dotenv CLI, but print settings instead of starting a server or database.
    writeFileSync(path.join(root, "bin/dotenv"), `#!/bin/bash\nexec '${process.execPath}' '${dotenvCli}' "$@"\n`, { mode: 0o755 });
    writeFileSync(path.join(root, "backend/bin/www.cjs"), 'console.log(JSON.stringify({ enabled: process.env.SHOP_MANUAL_CHECKOUT_EXPOSED, uri: process.env.DB_URI }))');
    const result = spawnSync("/bin/bash", [path.join(root, "scripts/start-backend.sh"), envFile], {
      encoding: "utf8",
      env: {
        PATH: `${path.join(root, "bin")}:${process.env.PATH}`, DB_URI: "mongodb://inherited/shared",
        ...(inherited === undefined ? {} : { SHOP_MANUAL_CHECKOUT_EXPOSED: inherited }),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const settings = JSON.parse(result.stdout.trim().split("\n").at(-1));
    assert.equal(settings.enabled, enabled, "backend must use dotenv's resolved setting");
    assert.equal(settings.uri, "mongodb://127.0.0.1/replica-set", "order review needs transactions whatever the checkout setting");
  });
}

// Runs the real startup script in a fake checkout. The database, dotenv, the server, and the seed
// script are stubs that print what they received, so no MongoDB or Docker is needed.
function runStartup(t, { envLines, seedExitCode = 0 }) {
  const root = mkdtempSync(path.join(tmpdir(), "shop-seed-startup-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ["scripts", "backend/bin", "backend/scripts", "bin"]) mkdirSync(path.join(root, dir), { recursive: true });
  writeFileSync(path.join(root, "scripts/start-backend.sh"), startupScript);
  writeFileSync(path.join(root, "scripts/start-mongodb.sh"), "printf 'DB_URI=mongodb://127.0.0.1/standalone\\n'\n");
  writeFileSync(path.join(root, "scripts/start-replica-set-mongodb.sh"), "printf 'DB_URI=mongodb://127.0.0.1/replica-set\\n'\n");
  const envFile = path.join(root, "checkout.env");
  writeFileSync(envFile, `${envLines}\n`);
  writeFileSync(path.join(root, "bin/dotenv"), `#!/bin/bash\nexec '${process.execPath}' '${dotenvCli}' "$@"\n`, { mode: 0o755 });
  writeFileSync(path.join(root, "backend/bin/www.cjs"), 'console.log("STARTED")');
  writeFileSync(
    path.join(root, "backend/scripts/seed-shop-orders.mjs"),
    `console.log(\`SEED \${process.argv.slice(2).join(" ")} uri=\${process.env.DB_URI}\`);\nprocess.exit(${seedExitCode});\n`,
  );
  return spawnSync("/bin/bash", [path.join(root, "scripts/start-backend.sh"), envFile], {
    encoding: "utf8",
    env: { PATH: `${path.join(root, "bin")}:${process.env.PATH}` },
  });
}

it("seeds the Orders dashboard before the server starts when SEED_SHOP=1", (t) => {
  const result = runStartup(t, { envLines: "SEED_SHOP=1" });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split("\n");
  assert.ok(lines.includes("SEED --if-empty uri=mongodb://127.0.0.1/replica-set"), result.stdout);
  assert.ok(lines.indexOf("SEED --if-empty uri=mongodb://127.0.0.1/replica-set") < lines.indexOf("STARTED"), "seed must finish before the server starts");
});

it("does not seed when SEED_SHOP is unset or 0", (t) => {
  for (const envLines of ["", "SEED_SHOP=0"]) {
    const result = runStartup(t, { envLines });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes("SEED"), `no seed expected for "${envLines || "unset"}"`);
    assert.ok(result.stdout.includes("STARTED"));
  }
});

it("stops startup when seeding fails, so the error is not hidden", (t) => {
  const result = runStartup(t, { envLines: "SEED_SHOP=1", seedExitCode: 1 });
  assert.notEqual(result.status, 0);
  assert.ok(!result.stdout.includes("STARTED"), "server must not start after a failed seed");
});
