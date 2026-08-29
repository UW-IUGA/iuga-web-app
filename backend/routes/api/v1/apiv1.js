import express from "express";
var router = express.Router();

import usersRouter from "./controllers/user.js";
import eventsRouter from "./controllers/events.js";
import feedbackRouter from "./controllers/feedback.js";
import rolesRouter from "./controllers/roles.js";
import eventRequestsRouter from "./controllers/eventRequests.js";
import cyclesRouter from "./controllers/cycles.js";
import charterRouter from "./controllers/charter.js";
import journalRouter from "./controllers/journal.js";
import contactsRouter from "./controllers/contacts.js";
import dashboardRouter from "./controllers/dashboard.js";
import notificationsRouter from "./controllers/notifications.js";
import exportsRouter from "./controllers/exports.js";

router.use("/user", usersRouter);
router.use("/events", eventsRouter);
router.use("/feedback", feedbackRouter);
router.use("/roles", rolesRouter);
router.use("/event-requests", eventRequestsRouter);
router.use("/cycles", cyclesRouter);
router.use("/charter", charterRouter);
router.use("/journal", journalRouter);
router.use("/contacts", contactsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/notifications", notificationsRouter);
router.use("/exports", exportsRouter);

export default router;
