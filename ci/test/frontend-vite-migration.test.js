import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const frontendPackage = JSON.parse(readFileSync(path.join(repoRoot, "frontend/package.json"), "utf8"));
const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));

test("frontend uses Vite for development, builds, and tests", () => {
    assert.equal(frontendPackage.scripts.start, "vite");
    assert.equal(frontendPackage.scripts.build, "vite build");
    assert.equal(frontendPackage.scripts.test, "vitest run");
    assert.equal(frontendPackage.dependencies["react-scripts"], undefined);
    assert.ok(frontendPackage.devDependencies.vite);
    assert.ok(frontendPackage.devDependencies.vitest);
});

test("local development starts Vite after the backend is ready with its selected API port", () => {
    assert.equal(rootPackage.scripts.dev, "node scripts/dev.mjs");
    assert.equal(rootPackage.scripts.frontend, "cd frontend && npm start");
    assert.equal(rootPackage.scripts["backend-dev"], "cd backend && npm start");
    const calls = [];
    const backend = new EventEmitter();
    backend.stdout = new EventEmitter();
    const runner = readFileSync(path.join(repoRoot, "scripts/dev.mjs"), "utf8")
        .replace(/^import .*;$/gm, "")
        .replace("import.meta.url", JSON.stringify(new URL("../../scripts/dev.mjs", import.meta.url).href));
    runInNewContext(runner, {
        spawn(command, args, options) {
            calls.push({ command, args: Array.from(args), options });
            return calls.length === 1 ? backend : new EventEmitter();
        },
        fileURLToPath,
        dirname: path.dirname,
        resolve: path.resolve,
        process: { env: { VITE_API_URL: "http://stale-api:7777" }, stdout: { write() {} }, on() {} },
        console: { log() {} },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, "npm");
    assert.deepEqual(calls[0].args, ["run", "backend-dev"]);
    backend.stdout.emit("data", Buffer.from("[startup] Connecting to database\n"));
    assert.equal(calls.length, 1);
    backend.stdout.emit("data", Buffer.from("[startup] Listening at localhost:8123\n"));
    assert.equal(calls.length, 2);
    assert.equal(calls[1].command, "npm");
    assert.deepEqual(calls[1].args, ["run", "frontend"]);
    assert.equal(calls[1].options.env.VITE_API_URL, "http://localhost:8123");
    backend.stdout.emit("data", Buffer.from("[startup] Listening at localhost:8123\n"));
    assert.equal(calls.length, 2);
});

test("local debugging builds the frontend in development mode", () => {
    assert.match(rootPackage.scripts.debug, /npm run build -- --mode development/);
});

test("Docker passes the public Vite API URL at build time", () => {
    const dockerfile = readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
    const deployScript = readFileSync(path.join(repoRoot, "ci/deploy.groovy"), "utf8");
    const devPipeline = readFileSync(path.join(repoRoot, "dev.jenkinsfile"), "utf8");
    const stagingPipeline = readFileSync(path.join(repoRoot, "staging.jenkinsfile"), "utf8");
    const productionPipeline = readFileSync(path.join(repoRoot, "prod.jenkinsfile"), "utf8");

    assert.match(dockerfile, /ARG VITE_API_URL/);
    assert.match(deployScript, /--build-arg VITE_API_URL=/);
    assert.match(devPipeline, /apiUrl:\s+'https:\/\/dev\.iuga\.info'/);
    assert.match(stagingPipeline, /apiUrl:\s+'https:\/\/staging\.iuga\.info'/);
    assert.match(productionPipeline, /apiUrl:\s+'https:\/\/iuga\.info'/);
    assert.doesNotMatch(dockerfile, /sed -i/);

    const e2eScript = readFileSync(path.join(repoRoot, "ci/test/e2e-deploy.sh"), "utf8");
    assert.match(e2eScript, /--build-arg VITE_API_URL=/);
});

test("production frontend builds require VITE_API_URL", () => {
    const result = spawnSync("npm", ["run", "build"], {
        cwd: path.join(repoRoot, "frontend"),
        env: { ...process.env, VITE_API_URL: undefined },
        encoding: "utf8",
    });

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /VITE_API_URL is required for production builds/);
});
