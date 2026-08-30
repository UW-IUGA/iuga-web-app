import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import sessions from "express-session";
import cors from "cors";
import path from "path";

import { models, connectToDatabase } from "./models.js";
import { createSessionOptions } from "./sessionConfig.js";
import apiv1Router from "./routes/api/v1/apiv1.js";
import { httpErrorHandler, sendSpaError } from "./httpErrorHandler.js";
import { ALLOWED_ORIGINS, REQUEST_BODY_LIMIT } from "./httpBoundaryConfig.js";
import { createCsrfProtection } from "./routes/api/v1/utils/csrf.js";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sessionSecret = process.env.SESSION_SECRET?.trim();
if (!sessionSecret) {
  console.error("FATAL: SESSION_SECRET not set");
  process.exit(1);
}

await connectToDatabase();
const app = express();


// Readiness probe for the pipeline health gate. The listener only starts
// after the DB connects, so 200 implies the database is reachable.
app.get("/readyz", (req, res) => res.json({ status: "ok" }));

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
Purpose: Serve the compiled SPA shell for the root route.
Authentication/Authorization Requirements: None

Expected Response Information:
- Return index.html so React Router can render the application.
- Return a safe server error if index.html cannot be read.
*/
app.get("/", function (req, res) {
  res.sendFile(
    path.join(__dirname, "../frontend/build/index.html"),
    function (err) {
      if (err) sendSpaError(res, err);
    },
  );
});

/*
Purpose: Serve the compiled SPA shell for direct navigation to /events.
Authentication/Authorization Requirements: None

Expected Response Information:
- Return index.html so React Router can render the events page.
- Return a safe server error if index.html cannot be read.
*/
app.get("/events", function (req, res) {
  res.sendFile(
    path.join(__dirname, "../frontend/build/index.html"),
    function (err) {
      if (err) sendSpaError(res, err);
    },
  );
});

/*
Purpose: Serve the compiled SPA shell for direct navigation to /resources.
Authentication/Authorization Requirements: None

Expected Response Information:
- Return index.html so React Router can render the resources page.
- Return a safe server error if index.html cannot be read.
*/
app.get("/resources", function (req, res) {
  res.sendFile(
    path.join(__dirname, "../frontend/build/index.html"),
    function (err) {
      if (err) sendSpaError(res, err);
    },
  );
});

/*
Purpose: Serve the compiled SPA shell for direct navigation to /electionfaq.
Authentication/Authorization Requirements: None

Expected Response Information:
- Return index.html so React Router can render the election FAQ page.
- Return a safe server error if index.html cannot be read.
*/
app.get("/electionfaq", function (req, res) {
  res.sendFile(
    path.join(__dirname, "../frontend/build/index.html"),
    function (err) {
      if (err) sendSpaError(res, err);
    },
  );
});

/*
Purpose: Serve the compiled SPA shell for direct navigation to /contact.
Authentication/Authorization Requirements: None

Expected Response Information:
- Return index.html so React Router can render the contact page.
- Return a safe server error if index.html cannot be read.
*/
app.get("/contact", function (req, res) {
  res.sendFile(
    path.join(__dirname, "../frontend/build/index.html"),
    function (err) {
      if (err) sendSpaError(res, err);
    },
  );
});

/*
Purpose: Serve the compiled SPA shell for direct navigation to /get-involved.
Authentication/Authorization Requirements: None

Expected Response Information:
- Return index.html so React Router can render the get-involved page.
- Return a safe server error if index.html cannot be read.
*/
app.get("/get-involved", function (req, res) {
  res.sendFile(
    path.join(__dirname, "../frontend/build/index.html"),
    function (err) {
      if (err) sendSpaError(res, err);
    },
  );
});

/*
Purpose: Serve uploaded public assets from the backend upload directory.
Authentication/Authorization Requirements: None

Expected Response Information:
- Matching uploaded files are served as static content.
*/
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

app.use("/api/v1", apiv1Router);
app.use(httpErrorHandler);

export default app;
