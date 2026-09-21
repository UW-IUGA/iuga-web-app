/*
Purpose: Mount every v1 resource router under /api/v1.
Authentication/Authorization Requirements: None here; each router gates its own routes.
Expected Request Information: Any request under /api/v1.
Expected Response Information: Whatever the matching resource router answers; an unmatched path falls
through to the app's 404 handling.
*/

import express from "express";
var router = express.Router();

import usersRouter from "./controllers/user.js";
import eventsRouter from "./controllers/events.js";
import feedbackRouter from "./controllers/feedback.js";
import rolesRouter from "./controllers/roles.js";
import eventRequestsRouter from "./controllers/eventRequests.js";
import shopRouter from "./controllers/shop.js";

router.use("/user", usersRouter);
router.use("/events", eventsRouter);
router.use("/feedback", feedbackRouter);
router.use("/roles", rolesRouter);
router.use("/event-requests", eventRequestsRouter);
router.use("/shop", shopRouter);

export default router;
