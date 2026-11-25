import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import sessions from "express-session";
import path from "path";

import { models, connectToDatabase } from "./models.js";
import { seedCreativeRecruitment } from "./committeeRecruitment.js";
import { seedPublishedEvents } from "./publishedEvents.js";
import { createSessionOptions, readSessionSecret } from "./http/session.js";
import apiv1Router from "./routes/api/v1/apiv1.js";
import {
  configureTrustedProxy,
  createApiRateLimiter,
  createRateLimiter,
} from "./routes/api/v1/utils/rateLimit.js";
import { createDiscordRouter } from "./routes/api/v1/controllers/discord.js";
import { createDiscordApprovals } from "./discordApprovals.js";
import { createDiscordClient } from "./discordClient.js";
import { createRsoDirectory } from "./rsoDirectory.js";
import { createRsoVerification } from "./discordRsoVerification.js";
import { createDiscordDispatcher } from "./discordDispatcher.js";
import { httpErrorHandler } from "./http/errors.js";
import {
  isAllowedOrigin,
  configureCorsAndReadiness,
  REQUEST_BODY_LIMIT,
} from "./http/boundary.js";
import { createCsrfProtection } from "./routes/api/v1/utils/csrf.js";
import { createSpaRouter } from "./http/spaRoutes.js";

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
await seedCreativeRecruitment(models.CommitteeRecruitment);
await seedPublishedEvents(models.Events);
const app = express();
configureTrustedProxy(app);

// Signed-in students are counted one by one. Everyone else is counted by network address, which
// many students share on campus Wi-Fi, so that limit is higher.
const apiRateLimiter = createApiRateLimiter({
  signedIn: { limit: 300, windowMs: 15 * 60_000 },
  anonymous: { limit: 600, windowMs: 15 * 60_000 },
});

configureCorsAndReadiness(app);

// No MIME sniffing, no framing by other sites, and only the origin as referrer across sites.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(logger("dev"));

/*
Purpose: Receive Discord interaction requests ahead of the JSON parser, so each signature is checked against the raw body.
Authentication/Authorization Requirements: Discord request signature, verified by the router. Mounted only when DISCORD_PUBLIC_KEY is set.

Expected Response Information:
- Unsigned requests receive 401; signed interactions receive a Discord interaction response.
*/
if (process.env.DISCORD_PUBLIC_KEY) {
  const discordClient = createDiscordClient({ botToken: process.env.DISCORD_BOT_TOKEN });
  const rsoDirectory = createRsoDirectory({
    models,
    client: discordClient,
    officerRoleId: process.env.DISCORD_OFFICER_ROLE_ID,
    staffRoleIds: [process.env.DISCORD_MOD_ROLE_ID, process.env.DISCORD_IUGA_OFFICER_ROLE_ID],
    iugaOfficerRoleId: process.env.DISCORD_IUGA_OFFICER_ROLE_ID,
  });
  const reviewerRoles = {
    modRoleId: process.env.DISCORD_MOD_ROLE_ID,
    iugaOfficerRoleId: process.env.DISCORD_IUGA_OFFICER_ROLE_ID,
  };
  const discordFlows = createDiscordDispatcher({
    events: createDiscordApprovals({
      models,
      directory: rsoDirectory,
      client: discordClient,
      config: {
        ...reviewerRoles,
        officerRoleId: process.env.DISCORD_OFFICER_ROLE_ID,
        approvalChannelId: process.env.DISCORD_APPROVAL_CHANNEL_ID,
        announcementChannelId: process.env.DISCORD_ANNOUNCEMENT_CHANNEL_ID,
        guildId: process.env.DISCORD_GUILD_ID,
      },
    }),
    rsoVerification: createRsoVerification({
      models,
      directory: rsoDirectory,
      client: discordClient,
      config: { ...reviewerRoles, rsoApprovalChannelId: process.env.DISCORD_RSO_APPROVAL_CHANNEL_ID },
    }),
  });
  app.use(
    "/api/v1/discord",
    createRateLimiter({ limit: 60, windowMs: 60_000 }),
    createDiscordRouter({ publicKey: process.env.DISCORD_PUBLIC_KEY, flow: discordFlows, client: discordClient }),
  );
}

// Bodies over REQUEST_BODY_LIMIT get a 413 from httpErrorHandler.
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false, limit: REQUEST_BODY_LIMIT }));

app.use(cookieParser());

// Disable entity tags so clients receive the latest generated response.
app.disable("etag");

app.use(express.static("../frontend/build"));

app.use(sessions(createSessionOptions(sessionSecret, process.env.DEPLOY_ENV)));
app.use(createCsrfProtection({ isAllowedOrigin }));

app.use((req, res, next) => {
  req.models = models;
  next();
});

// Client-side routes get index.html so React Router can render them.
app.use(
  createSpaRouter({
    indexPath: path.join(__dirname, "../frontend/build/index.html"),
  }),
);

app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

app.use("/api/v1", apiRateLimiter, apiv1Router);
app.use(httpErrorHandler);

export default app;
