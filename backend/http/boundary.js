import cors from "cors";

export const REQUEST_BODY_LIMIT = "32kb";
export const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://iuga.info",
  "https://staging.iuga.info",
  "https://dev.iuga.info",
];

/**
 * @behavior Applies the shared CORS policy before registering the readiness route.
 * @param {import("express").Express} app
 * @returns {void}
 */
export function configureCorsAndReadiness(app) {
  app.use(
    cors({
      origin: function (origin, callback) {
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error("CORS origin not allowed"));
      },
      credentials: true,
    }),
  );

  app.get("/readyz", (_req, res) => res.json({ status: "ok" }));
}
