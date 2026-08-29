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
}) {
  if (typeof req.models?.AuditEntries?.create !== "function") return null;
  return req.models.AuditEntries.create({
    eventRequestId,
    cycleId,
    actorId: req.session.userId,
    action,
    fromStatus: fromStatus ? canonicalState(fromStatus) : null,
    toStatus,
    comment,
    amountCents,
  });
}
