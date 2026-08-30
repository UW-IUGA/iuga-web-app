import express from "express";
import { once } from "node:events";

let nextTestIp = 1;

export async function makeTestApi({ router, mountPath, models, session = {} }) {
  const app = express();
  app.set("trust proxy", 1);
  const testIp = `127.0.0.${nextTestIp++}`;
  const requestContexts = new Map();
  let nextRequestId = 0;

  app.use(express.json());
  app.use((req, _res, next) => {
    const context = requestContexts.get(req.headers["x-test-request-id"]);
    req.models = context?.models ?? models;
    req.session = context?.session ?? session;
    next();
  });
  app.use(mountPath, router);

  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  return {
    async request(
      method,
      path,
      body,
      {
        session: sessionOverrides = {},
        models: requestModels,
        headers: requestHeaders = {},
      } = {},
    ) {
      const requestId = String(++nextRequestId);
      const requestSession = { ...session, ...sessionOverrides };
      requestContexts.set(requestId, {
        models: requestModels ?? models,
        session: requestSession,
      });

      try {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": testIp,
            ...requestHeaders,
            "x-test-request-id": requestId,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        return {
          status: response.status,
          body: text ? JSON.parse(text) : null,
          session: requestSession,
        };
      } finally {
        requestContexts.delete(requestId);
      }
    },
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
