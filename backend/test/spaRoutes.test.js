import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import express from "express";
import { createSpaRouter } from "../http/spaRoutes.js";

const HOLD_ID = "64b000000000000000000001";

describe("createSpaRouter", () => {
  let dir;
  let server;
  let baseUrl;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "spa-routes-"));
    const indexPath = join(dir, "index.html");
    writeFileSync(indexPath, "<html>app shell</html>");

    const app = express();
    app.use(createSpaRouter({ indexPath }));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves the app shell when a checkout page is loaded directly by its hold id", async () => {
    const response = await fetch(`${baseUrl}/shop/checkout/${HOLD_ID}`);

    assert.equal(response.status, 200);
    assert.match(await response.text(), /app shell/);
  });

  it("does not serve the app shell for a checkout path that is not a hold id", async () => {
    const response = await fetch(`${baseUrl}/shop/checkout/abc`);

    assert.equal(response.status, 404);
  });
});
