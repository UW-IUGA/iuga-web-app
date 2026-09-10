import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const frontendPackage = JSON.parse(readFileSync(path.join(repoRoot, "frontend/package.json"), "utf8"));

test("frontend uses Vite for development, builds, and tests", () => {
    assert.equal(frontendPackage.scripts.start, "vite");
    assert.equal(frontendPackage.scripts.build, "vite build");
    assert.equal(frontendPackage.scripts.test, "vitest run");
    assert.equal(frontendPackage.dependencies["react-scripts"], undefined);
    assert.ok(frontendPackage.devDependencies.vite);
    assert.ok(frontendPackage.devDependencies.vitest);
});

function loadProductionViteConfig(env) {
    return spawnSync(
        process.execPath,
        [
            "--input-type=module",
            "--eval",
            `
                import { loadConfigFromFile } from "vite";
                import path from "node:path";
                const result = await loadConfigFromFile(
                    { command: "build", mode: "production" },
                    path.join(process.cwd(), "vite.config.mjs"),
                );
                if (!result?.config) {
                    throw new Error("Vite configuration did not load");
                }
            `,
        ],
        {
            cwd: path.join(repoRoot, "frontend"),
            env,
            encoding: "utf8",
        },
    );
}

test("production frontend config requires VITE_ENTRA_API_SCOPE", () => {
    const env = {
        ...process.env,
        VITE_API_URL: "https://api.example.test",
    };
    delete env.VITE_ENTRA_API_SCOPE;
    const result = loadProductionViteConfig(env);

    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /VITE_ENTRA_API_SCOPE is required/);
});

test("production frontend config loads with both public API values", () => {
    const result = loadProductionViteConfig({
        ...process.env,
        VITE_API_URL: "https://api.example.test",
        VITE_ENTRA_API_SCOPE: "api://example/access_as_user",
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
