import express from "express";
import { once } from "node:events";

export async function makeTestApi({ router, mountPath, models, session = {} }) {
  const app = express();
  let currentSession = session;
  let currentModels = models;

  app.use(express.json());
  app.use((req, _res, next) => {
    req.models = currentModels;
    req.session = currentSession;
    next();
  });
  app.use(mountPath, router);

  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address();

  return {
    async request(method, path, body, { session: sessionOverrides = {}, models: requestModels, headers: extraHeaders = {} } = {}) {
      currentSession = { ...session, ...sessionOverrides };
      currentModels = requestModels ?? models;
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: { "content-type": "application/json", ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      return {
        status: response.status,
        body: text ? JSON.parse(text) : null,
        session: currentSession,
      };
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
