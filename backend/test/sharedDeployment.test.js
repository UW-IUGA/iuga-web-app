import assert from "node:assert/strict";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { it } from "node:test";

it("the production image can load published events with its copied modules", async () => {
  const root = new URL("../../", import.meta.url);
  const dockerfile = await readFile(new URL("Dockerfile", root), "utf8");
  const directory = await mkdtemp(join(tmpdir(), "iuga-shared-deployment-"));
  const productionStage = dockerfile.split("# Production stage")[1];
  // Preserve the backend's relative import layout without loading database dependencies.
  const app = join(directory, "app");
  await cp(new URL("backend/publishedEvents.js", root), join(app, "backend", "publishedEvents.mjs"));
  if (/COPY\s+shared\/\s+\/app\/shared\/?/.test(productionStage)) {
    await cp(new URL("shared/", root), join(app, "shared"), { recursive: true });
  }
  const result = spawnSync(process.execPath, [join(app, "backend", "publishedEvents.mjs")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(dockerfile.split("# Production stage")[0], /COPY\s+shared\/\s+\/app\/shared\/?/, "frontend build also needs the shared modules");
});
