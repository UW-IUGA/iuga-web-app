/*
Purpose: Build the Express application: connect the database, order the middleware every request
passes through, and mount the API routes.
Authentication/Authorization Requirements: None at this level; each route does its own check.
Expected Request Information: Any request to the site — API calls, the built frontend page, and the
signed Stripe webhook.
Expected Response Information: The JSON API envelope, the built frontend page, or the /readyz health
answer. Middleware order is load-bearing: the Stripe webhook is mounted above the JSON body parsers,
because a parsed body can no longer be checked against Stripe's signature.
*/

import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import sessions from "express-session";
import cors from "cors";
import path from "path";

import { models, connectToDatabase } from "./models.js";
import { createSessionOptions, readSessionSecret } from "./http/session.js";
import apiv1Router from "./routes/api/v1/apiv1.js";
import {
  configureTrustedProxy,
  createRateLimiter,
} from "./routes/api/v1/utils/rateLimit.js";
import { httpErrorHandler, sendSpaError } from "./http/errors.js";
import { ALLOWED_ORIGINS, REQUEST_BODY_LIMIT } from "./http/boundary.js";
import { createCsrfProtection } from "./routes/api/v1/utils/csrf.js";
import { createSpaRouter } from "./http/spaRoutes.js";
import { evaluateCheckoutReadiness } from "./shop/checkout/readiness.js";
import { createStripeWebhookRouter } from "./routes/api/v1/stripeWebhook.js";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { envName: secretEnvName, value: sessionSecret } = readSessionSecret(process.env);
if (!sessionSecret) {
  console.error(`FATAL: ${secretEnvName} not set`);
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

/*
Purpose: Allow credentialed browser requests only from documented local and IUGA origins.
Authentication/Authorization Requirements: None

Expected Response Information:
- Allowed origins receive CORS headers; arbitrary origins are rejected.
*/
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
Purpose: Accept signed Stripe webhook deliveries.
Authentication/Authorization Requirements: None. Stripe authenticates with an HMAC signature over
the raw request body, so this must stay above every body parser, the session middleware, CSRF, and
the generic API limiter — once a parser consumes the stream, the delivery can no longer be verified.

Expected Request Information:
- POST /api/v1/stripe/webhook with the exact Stripe event bytes and a stripe-signature header.

Expected Response Information:
- 200 once the delivery is durably recorded, including a duplicate; a safe 400 for anything we
  could not verify.
*/
app.use(
  "/api/v1/stripe/webhook",
  createStripeWebhookRouter({ models, env: process.env }),
);

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

/*
Purpose: Serve the versioned API from one router, behind the shared rate limiter.
Authentication/Authorization Requirements: None here; each resource router checks its own routes.

Expected Response Information:
- Requests inside the rate limit reach the API; a client over the limit receives 429.
*/
app.use("/api/v1", apiRateLimiter, apiv1Router);

/*
Purpose: Turn anything raised by the middleware or routes above into the API error envelope. Mounted
last, so it catches every failure.
Authentication/Authorization Requirements: None

Expected Response Information:
- The API error envelope: 500 for an unexpected failure, with the detail written to the log only.
*/
app.use(httpErrorHandler);

export default app;
