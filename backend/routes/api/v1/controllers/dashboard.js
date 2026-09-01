import express from "express";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";
import { canonicalState } from "../utils/eventWorkflow.js";
import { getActiveCycle, getEffectivePermissions } from "../utils/permissions.js";

const router = express.Router();
const QUEUES = [
  { permission: "events.leadership.approve", status: "PVP_REVIEW", label: "P/VP review" },
  { permission: "events.meeting.manage", status: "AGENDA", label: "Exec board agenda" },
  { permission: "events.finance.manage", status: "FINANCE_REVIEW", label: "Finance review" },
  { permission: "events.marketing.manage", status: "MARKETING_QUEUED", label: "PR queue" },
  { permission: "events.publication.manage", status: "SCHEDULED", label: "Ready to publish", key: "READY_TO_PUBLISH", filter: { publishedEventId: null } },
  // A request never persists in AWAITING_REVIEW (POST /reviews walks it straight
  // to REVIEWED), so "ready for review" is a scheduled request whose purchase
  // log is posted and whose event date has passed.
  {
    permission: "events.review.manage",
    status: "SCHEDULED",
    label: "Post-event review",
    key: "POST_EVENT_REVIEW",
    filter: () => ({
      checkpoints: { $elemMatch: { key: "purchases", status: "completed" } },
      proposedStartDate: { $lte: new Date() },
    }),
  },
];
const STALLED_DAYS = Number(process.env.ADMIN_STALLED_DAYS || 7);
const RESPONSIBILITY_BY_STATE = Object.freeze({
  DRAFT: { role: "Requester", permission: "events.requests.edit", requesterOnly: true },
  PVP_REVIEW: { role: "President / Vice President", permission: "events.leadership.approve" },
  AGENDA: { role: "Exec Board", permission: "events.meeting.manage" },
  FINANCE_REVIEW: { role: "Director of Finance", permission: "events.finance.manage" },
  MARKETING_QUEUED: { role: "Director of PR", permission: "events.marketing.manage" },
  SCHEDULED: { role: "Requester", permission: "events.requests.edit", requesterOnly: true },
  AWAITING_REVIEW: { role: "Requester", permission: "events.review.manage", requesterOnly: true },
});

function addNextResponsibleRole(request) {
  const state = canonicalState(request.status);
  let role = RESPONSIBILITY_BY_STATE[state]?.role || null;
  // A scheduled-but-unpublished event is the PR director's to publish, not the
  // requester's (whose purchases work only starts once it is live).
  if (state === "SCHEDULED" && !request.publishedEventId) role = "Director of PR";
  return { ...request, nextResponsibleRole: role };
}

function canSeeStalledRequest(request, permissions, userId) {
  const state = canonicalState(request.status);
  const responsibility = RESPONSIBILITY_BY_STATE[state];
  if (!responsibility) return false;
  if (responsibility.requesterOnly) return String(request.requesterId) === String(userId);
  return permissions.includes(responsibility.permission);
}

function stalledRequestFilter(permissions, userId, stalledBefore) {
  const responsibilityFilters = [
    { requesterId: userId, status: { $in: ["DRAFT", "SCHEDULED", "AWAITING_REVIEW"] } },
  ];

  for (const [status, responsibility] of Object.entries(RESPONSIBILITY_BY_STATE)) {
    if (!responsibility.requesterOnly && permissions.includes(responsibility.permission)) {
      responsibilityFilters.push({ status });
    }
  }

  return { updatedAt: { $lte: stalledBefore }, $or: responsibilityFilters };
}

router.get("/", requirePermission("dashboard.read"), async (req, res) => {
  try {
    const permissions = await getEffectivePermissions(req);
    const queues = [];
    for (const queue of QUEUES) {
      if (!permissions.includes(queue.permission)) continue;
      const filter = typeof queue.filter === "function" ? queue.filter() : queue.filter;
      const requests = await req.models.EventRequests.find({ status: queue.status, ...filter }).sort({ eventDate: 1, proposedStartDate: 1 }).lean();
      queues.push({ key: queue.key || queue.status, label: queue.label, requests: requests.map(addNextResponsibleRole) });
    }
    const ownRequests = (await req.models.EventRequests.find({ requesterId: req.session.userId }).sort({ updatedAt: -1 }).lean()).map(addNextResponsibleRole);
    const stalledBefore = new Date(Date.now() - STALLED_DAYS * 24 * 60 * 60 * 1000);
    const stalledCandidates = await req.models.EventRequests.find(stalledRequestFilter(permissions, req.session.userId, stalledBefore)).sort({ updatedAt: 1 }).lean();
    const stalled = stalledCandidates.filter((request) => canSeeStalledRequest(request, permissions, req.session.userId)).map(addNextResponsibleRole);
    const activeCycle = permissions.some((permission) => ["events.finance.manage", "events.leadership.approve"].includes(permission)) ? await getActiveCycle(req) : null;
    return sendSuccess(res, { queues, ownRequests, stalled, activeCycle, stalledDays: STALLED_DAYS });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

export default router;
