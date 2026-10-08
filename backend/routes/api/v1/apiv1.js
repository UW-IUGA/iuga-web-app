import express from "express";
var router = express.Router();

import usersRouter from "./controllers/user.js";
import eventsRouter from "./controllers/events.js";
import feedbackRouter from "./controllers/feedback.js";
import rolesRouter from "./controllers/roles.js";
import eventRequestsRouter from "./controllers/eventRequests.js";
import recruitmentRouter from "./controllers/recruitment.js";
import { createShopRouter } from "./controllers/shop.js";
import { shopCatalog } from "./utils/shopCatalog.js";
import { createStripeClient } from "./utils/stripeClient.js";

router.use("/user", usersRouter);
router.use("/events", eventsRouter);
router.use("/feedback", feedbackRouter);
router.use("/roles", rolesRouter);
router.use("/event-requests", eventRequestsRouter);
router.use("/recruitment", recruitmentRouter);
router.use(
  "/shop",
  createShopRouter({
    stripe: createStripeClient(),
    catalog: shopCatalog,
  }),
);

export default router;
