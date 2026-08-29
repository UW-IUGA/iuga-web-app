import express from "express";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";
import { getActiveCycle, getEffectivePermissions } from "../utils/permissions.js";

const router = express.Router();
const QUEUES = [
  ["events.leadership.approve", "PVP_REVIEW", "P/VP review"],
  ["events.meeting.manage", "AGENDA", "Exec board agenda"],
  ["events.finance.manage", "FINANCE_REVIEW", "Finance review"],
  ["events.marketing.manage", "MARKETING_QUEUED", "PR queue"],
  ["events.review.manage", "AWAITING_REVIEW", "Post-event review"],
];
const STALLED_DAYS = Number(process.env.ADMIN_STALLED_DAYS || 7);

router.get("/", requirePermission("dashboard.read"), async (req, res) => {
  try {
    const permissions = await getEffectivePermissions(req);
    const queues = [];
    for (const [permission, status, label] of QUEUES) {
      if (!permissions.includes(permission)) continue;
      const requests = await req.models.EventRequests.find({ status }).sort({ eventDate: 1, proposedStartDate: 1 }).lean();
      queues.push({ key: status, label, requests });
    }
    const ownRequests = await req.models.EventRequests.find({ requesterId: req.session.userId }).sort({ updatedAt: -1 }).lean();
    const stalledBefore = new Date(Date.now() - STALLED_DAYS * 24 * 60 * 60 * 1000);
    const stalled = await req.models.EventRequests.find({ updatedAt: { $lte: stalledBefore }, status: { $nin: ["REJECTED", "ARCHIVED", "denied", "cancelled"] } }).sort({ updatedAt: 1 }).lean();
    const activeCycle = permissions.some((permission) => ["events.finance.manage", "events.leadership.approve"].includes(permission)) ? await getActiveCycle(req) : null;
    return sendSuccess(res, { queues, ownRequests, stalled, activeCycle, stalledDays: STALLED_DAYS });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

export default router;
