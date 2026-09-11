import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import sessions from "express-session";
import cors from "cors";
import path from "path";

import { models, connectToDatabase } from "./models.js";
import { createSessionOptions } from "./sessionConfig.js";
import apiv1Router from "./routes/api/v1/apiv1.js";
import {
  configureTrustedProxy,
  createRateLimiter,
} from "./routes/api/v1/utils/rateLimit.js";
import { httpErrorHandler, sendSpaError } from "./httpErrorHandler.js";
import { ALLOWED_ORIGINS, REQUEST_BODY_LIMIT } from "./httpBoundaryConfig.js";
import { createCsrfProtection } from "./routes/api/v1/utils/csrf.js";
import { createSpaRouter } from "./spaRoutes.js";
import { evaluateCheckoutReadiness } from "./checkoutReadiness.js";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Session signing secret is per deployment environment so one env source can
// hold all three. DEPLOY_ENV is injected in every container (deploy.groovy).
const secretKeyByEnv = {
  development: "SESSION_SECRET_DEV",
  staging: "SESSION_SECRET_STAGING",
  production: "SESSION_SECRET_PROD",
};
const secretKey = secretKeyByEnv[process.env.DEPLOY_ENV] ?? "SESSION_SECRET";
const sessionSecret = process.env[secretKey]?.trim();
if (!sessionSecret) {
  console.error(`FATAL: ${secretKey} not set`);
  process.exit(1);
}

await connectToDatabase();
const app = express();
configureTrustedProxy(app);

// No infrastructure or policy evidence is wired yet, so this remains false.
const checkoutReadiness = evaluateCheckoutReadiness({ env: process.env });

const apiRateLimiter = createRateLimiter({
  limit: 100,
  windowMs: 15 * 60_000,
});

// General readiness remains tied to the running API and database. Checkout is
// reported as a separate fail-closed capability and never changes the HTTP status.
app.get("/readyz", (req, res) => res.json({
  status: "ok",
  checkoutEnabled: checkoutReadiness.checkoutEnabled,
}));

const allowedOrigins = ALLOWED_ORIGINS;

/*
Purpose: Allow credentialed browser requests only from documented local and IUGA origins.
Authentication/Authorization Requirements: None

Expected Response Information:
- Allowed origins receive CORS headers; arbitrary origins are rejected.
*/
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  }),
);

/*
Purpose: Add browser security headers to every response.
Authentication/Authorization Requirements: None

Expected Request Information:
- Parameters: N/A
- Queries: N/A
- Body: N/A

Expected Response Information:
- X-Content-Type-Options: Prevents MIME-type sniffing.
- X-Frame-Options: Prevents this application from being framed.
- Referrer-Policy: Limits referrer data sent across origins.
*/
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

/*
Purpose: Log incoming HTTP requests for operational debugging.
Authentication/Authorization Requirements: None

Expected Request Information:
- Any HTTP request handled by the application.
*/
app.use(logger("dev"));
/*
Purpose: Parse JSON and URL-encoded bodies while rejecting payloads above 32 KB.
Authentication/Authorization Requirements: None

Expected Response Information:
- Valid bodies are available to controllers; oversized bodies receive a client error.
*/
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));

/*
Purpose: Read signed and unsigned cookies from incoming browser requests.
Authentication/Authorization Requirements: None

Expected Request Information:
- Cookie headers supplied by the browser.
*/
app.use(cookieParser());

// Disable entity tags so clients receive the latest generated response.
app.disable("etag");

/*
Purpose: Serve the compiled frontend assets without conditional-cache responses.
Authentication/Authorization Requirements: None

Expected Response Information:
- Matching static files are served; missing files continue through the route chain.
*/
app.use(express.static("../frontend/build"));

/*
Purpose: Create the server-side session boundary using the deployment cookie policy.
Authentication/Authorization Requirements: None

Expected Response Information:
- Requests receive session state only when a route uses it.
*/
app.use(sessions(createSessionOptions(sessionSecret, process.env.DEPLOY_ENV)));
app.use(createCsrfProtection({ allowedOrigins }));

/*
Purpose: Attach the shared Mongoose model registry to each request for controllers.
Authentication/Authorization Requirements: None

Expected Response Information:
- Controllers can access models through req.models.
*/
app.use((req, res, next) => {
  req.models = models;
  next();
});

/*
Purpose: Serve the compiled SPA shell for every registered client-side route.
Authentication/Authorization Requirements: None

Expected Response Information:
- Return index.html so React Router can render the requested application page.
- Return a safe server error if index.html cannot be read.
*/
app.use(
  createSpaRouter({
    indexPath: path.join(__dirname, "../frontend/build/index.html"),
  }),
);

/*
Purpose: Serve uploaded public assets from the backend upload directory.
Authentication/Authorization Requirements: None

Expected Response Information:
- Matching uploaded files are served as static content.
*/
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

app.use("/api/v1", apiRateLimiter, apiv1Router);
app.use(httpErrorHandler);

export default app;
