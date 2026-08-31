export const REQUEST_STATES = Object.freeze([
  "DRAFT",
  "PVP_REVIEW",
  "AGENDA",
  "FINANCE_REVIEW",
  "MARKETING_QUEUED",
  "SCHEDULED",
  "AWAITING_REVIEW",
  "REVIEWED",
  "REJECTED",
  "ARCHIVED",
]);

const LEGACY_STATE_MAP = Object.freeze({
  draft: "DRAFT",
  submitted: "PVP_REVIEW",
  changes_requested: "DRAFT",
  approved: "SCHEDULED",
  denied: "REJECTED",
  completed: "REVIEWED",
  cancelled: "REJECTED",
});

const RESPONSIBLE_ROLE_BY_STATE = Object.freeze({
  PVP_REVIEW: "president_or_vice_president",
  AGENDA: "exec_board",
  FINANCE_REVIEW: "director_of_finance",
  MARKETING_QUEUED: "director_of_pr",
  AWAITING_REVIEW: "requester",
});

export const STATE_TRANSITIONS = Object.freeze({
  DRAFT: ["PVP_REVIEW"],
  PVP_REVIEW: ["DRAFT", "AGENDA", "REJECTED"],
  AGENDA: ["AGENDA", "FINANCE_REVIEW", "REJECTED"],
  FINANCE_REVIEW: ["MARKETING_QUEUED", "REJECTED"],
  MARKETING_QUEUED: ["SCHEDULED"],
  SCHEDULED: ["AWAITING_REVIEW"],
  AWAITING_REVIEW: ["REVIEWED"],
  REVIEWED: ["ARCHIVED"],
  REJECTED: [],
  ARCHIVED: [],
});

export function canonicalState(status) {
  return LEGACY_STATE_MAP[status] || status;
}

export function canTransition(fromStatus, toStatus) {
  return (STATE_TRANSITIONS[canonicalState(fromStatus)] || []).includes(toStatus);
}

export function assertTransition(fromStatus, toStatus) {
  if (!canTransition(fromStatus, toStatus)) {
    const error = new Error(`Cannot transition event request from ${canonicalState(fromStatus)} to ${toStatus}`);
    error.statusCode = 409;
    throw error;
  }
}

export async function recordAudit(req, {
  eventRequestId,
  cycleId = null,
  action,
  fromStatus = null,
  toStatus = null,
  comment = "",
  amountCents = null,
  requesterId = null,
}) {
  const audit = typeof req.models?.AuditEntries?.create === "function"
    ? await req.models.AuditEntries.create({
        eventRequestId,
        cycleId,
        actorId: req.session.userId,
        action,
        fromStatus: fromStatus ? canonicalState(fromStatus) : null,
        toStatus,
        comment,
        amountCents,
      })
    : null;

  if (typeof req.models?.Notifications?.create === "function" && (requesterId || toStatus)) {
  const base = { eventRequestId, decision: action, comment, link: `/admin/pipeline/${eventRequestId}` };
    if (requesterId) await req.models.Notifications.create({ ...base, recipientId: requesterId });
    const recipientRole = RESPONSIBLE_ROLE_BY_STATE[toStatus];
    if (recipientRole && recipientRole !== "requester") await req.models.Notifications.create({ ...base, recipientRole });
  }
  return audit;
}
