import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";
import { getActiveCycle } from "../utils/permissions.js";
import {
  REQUEST_STATES,
  assertTransition,
  recordAudit,
} from "../utils/eventWorkflow.js";

const router = express.Router();
const CHECKPOINT_KEYS = [
  "proposal",
  "meeting",
  "finance",
  "room",
  "marketing",
  "purchases",
  "completion",
  "review",
];
const CHECKPOINT_STATUSES = new Set(["pending", "in_progress", "completed"]);
const LEADERSHIP_STATUSES = ["submitted", "changes_requested"];
const SHORT_NOTICE_DAYS = Number(process.env.EVENT_SHORT_NOTICE_DAYS || 14);

function validId(value) {
  return mongoose.isValidObjectId(value);
}

function defaultCheckpoints() {
  return CHECKPOINT_KEYS.map((key) => ({ key, status: "pending" }));
}

function readRequestFields(body = {}) {
  const fields = {};
  const canonicalInput = [
    "title",
    "eventDate",
    "eventTime",
    "location",
    "purpose",
    "estimatedAttendance",
    "fundingRequestedCents",
  ].some((key) => body[key] !== undefined);

  if (canonicalInput) {
    const title = body.title ?? body.eventName;
    const purpose = body.purpose ?? body.description;
    const eventDate = body.eventDate ?? body.proposedStartDate;
    if (typeof body.requestingGroup !== "string" || body.requestingGroup.trim() === "") return { error: "requestingGroup is required" };
    fields.requestingGroup = body.requestingGroup.trim();
    for (const [key, value] of [["title", title], ["purpose", purpose], ["eventTime", body.eventTime], ["location", body.location]]) {
      if (typeof value !== "string" || value.trim() === "") return { error: `${key} is required` };
      fields[key] = value.trim();
    }
    if (!eventDate || Number.isNaN(new Date(eventDate).getTime())) return { error: "eventDate must be a valid date" };
    fields.eventDate = new Date(eventDate);
    if (!Number.isInteger(body.estimatedAttendance) || body.estimatedAttendance < 0) return { error: "estimatedAttendance must be a non-negative integer" };
    if (!cents(body.fundingRequestedCents)) return { error: "fundingRequestedCents must be a non-negative integer" };
    fields.estimatedAttendance = body.estimatedAttendance;
    fields.fundingRequestedCents = body.fundingRequestedCents;
    fields.eventName = fields.title;
    fields.description = fields.purpose;
    fields.proposedStartDate = fields.eventDate;
    fields.marketingNotes = typeof body.marketingNotes === "string" ? body.marketingNotes.trim() : "";
    if (body.promotionalAssets !== undefined && (!Array.isArray(body.promotionalAssets) || body.promotionalAssets.some((asset) => typeof asset !== "string"))) {
      return { error: "promotionalAssets must be an array of strings" };
    }
    fields.promotionalAssets = (body.promotionalAssets || []).map((asset) => asset.trim()).filter(Boolean);
    fields.shortNotice = new Date() > new Date(fields.eventDate.getTime() - SHORT_NOTICE_DAYS * 24 * 60 * 60 * 1000);
    fields.shortNoticeDays = SHORT_NOTICE_DAYS;
    return { fields, canonicalInput: true };
  }

  for (const key of ["eventName", "requestingGroup", "description", "audience"]) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "string" || body[key].trim() === "") {
        return { error: `${key} must be a non-empty string` };
      }
      fields[key] = body[key].trim();
    }
  }

  for (const key of ["eventName", "requestingGroup", "description", "audience"]) {
    const max = key === "description" ? 2000 : key === "audience" ? 500 : 120;
    if (fields[key] && fields[key].length > max) {
      return { error: `${key} must be ${max} characters or fewer` };
    }
  }

  if (!fields.eventName || !fields.requestingGroup || !fields.description) {
    return { error: "eventName, requestingGroup, and description are required" };
  }

  const start = new Date(body.proposedStartDate);
  if (!body.proposedStartDate || Number.isNaN(start.getTime())) {
    return { error: "proposedStartDate must be a valid date" };
  }
  fields.proposedStartDate = start;

  if (body.proposedEndDate !== undefined && body.proposedEndDate !== null) {
    const end = new Date(body.proposedEndDate);
    if (Number.isNaN(end.getTime()) || end < start) {
      return { error: "proposedEndDate must be a valid date after proposedStartDate" };
    }
    fields.proposedEndDate = end;
  }

  if (body.audience === undefined) fields.audience = "";
  if (body.rsvpEnabled !== undefined) {
    if (typeof body.rsvpEnabled !== "boolean") {
      return { error: "rsvpEnabled must be a boolean" };
    }
    fields.rsvpEnabled = body.rsvpEnabled;
  }
  if (body.rsvpQuestions !== undefined) {
    if (!Array.isArray(body.rsvpQuestions)) {
      return { error: "rsvpQuestions must be an array" };
    }
    fields.rsvpQuestions = body.rsvpQuestions;
  }
  if (body.slideTemplate !== undefined) {
    const template = body.slideTemplate;
    if (!template || typeof template !== "object" || Array.isArray(template)) {
      return { error: "slideTemplate must be an object" };
    }
    if (template.name !== undefined && typeof template.name !== "string") {
      return { error: "slideTemplate.name must be a string" };
    }
    if (template.url !== undefined && typeof template.url !== "string") {
      return { error: "slideTemplate.url must be a string" };
    }
    if (template.version !== undefined && typeof template.version !== "string") {
      return { error: "slideTemplate.version must be a string" };
    }
    fields.slideTemplate = {
      name: template.name?.trim() ?? "",
      url: template.url?.trim() ?? "",
      version: template.version?.trim() ?? "",
    };
  }

  fields.title = fields.eventName;
  fields.purpose = fields.description;
  fields.eventDate = fields.proposedStartDate;
  return { fields, canonicalInput: false };
}

function readReason(body = {}, name = "reason") {
  if (typeof body[name] !== "string" || body[name].trim() === "") {
    return `${name} is required`;
  }
  if (body[name].trim().length > 2000) return `${name} is too long`;
  return null;
}

function cents(value) {
  return Number.isInteger(value) && value >= 0;
}

function canonicalRequest(request) {
  return REQUEST_STATES.includes(request.status);
}

function parseOptionalDate(value, message) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? { error: message } : date;
}

function nextAgendaDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date;
}

async function canonicalTransition(req, id, request, toStatus, update, audit) {
  assertTransition(request.status, toStatus);
  const updated = await req.models.EventRequests.findOneAndUpdate(
    { _id: id, status: request.status },
    { $set: { ...update, status: toStatus } },
    { new: true, runValidators: true },
  );
  if (!updated) return null;
  await recordAudit(req, {
    eventRequestId: id,
    cycleId: request.cycleId,
      action: audit.action,
      fromStatus: request.status,
      toStatus,
      comment: audit.comment,
      amountCents: audit.amountCents,
      requesterId: request.requesterId,
  });
  return updated;
}

function completeCheckpoint(checkpoints, key, actorId) {
  return (checkpoints || []).map((checkpoint) =>
    checkpoint.key === key
      ? {
          ...checkpoint,
          status: "completed",
          completedBy: actorId,
          completedAt: new Date(),
          updatedBy: actorId,
          updatedAt: new Date(),
        }
      : checkpoint,
  );
}

async function findRequest(req, id) {
  return req.models.EventRequests.findById(id)
    .populate("requesterId organizerId publishedEventId")
    .lean();
}

async function transitionRequest(req, id, statuses, update) {
  return req.models.EventRequests.findOneAndUpdate(
    { _id: id, status: { $in: statuses } },
    { $set: update },
    { new: true, runValidators: true },
  );
}

async function requireCheckpointPermission(req, res, next) {
  const permission = {
    proposal: "events.leadership.approve",
    finance: "events.finance.manage",
    room: "events.room.manage",
    marketing: "events.marketing.manage",
    purchases: "events.purchases.complete",
  }[req.params.step];
  return requirePermission(permission || "events.operations.manage")(req, res, next);
}

router.post("/", requirePermission("events.requests.create"), async (req, res) => {
  const { fields, error, canonicalInput } = readRequestFields(req.body);
  if (error) return sendError(res, 400, error);

  try {
    const cycle = canonicalInput ? await getActiveCycle(req) : null;
    if (canonicalInput && !cycle) return sendError(res, 409, "No active academic year");
    const status = canonicalInput ? (req.body.saveAsDraft ? "DRAFT" : "PVP_REVIEW") : "submitted";
    const request = await req.models.EventRequests.create({
      ...fields,
      requesterId: req.session.userId,
      organizerId: req.session.userId,
      submittedBy: req.session.userId,
      submittedAt: new Date(),
      status,
      cycleId: cycle?._id ?? null,
      checkpoints: defaultCheckpoints(),
    });
    await recordAudit(req, {
      eventRequestId: request._id,
      cycleId: cycle?._id ?? null,
      action: "submitted",
      toStatus: canonicalInput ? status : null,
      requesterId: req.session.userId,
    });
    return res.status(201).json({ status: "success", eventRequest: request });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id/draft", requirePermission("events.requests.edit"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { fields, error } = readRequestFields(req.body);
  if (error) return sendError(res, 400, error);
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request) || request.status !== "DRAFT") return sendError(res, 409, "Only draft requests can be edited");
    if (String(request.requesterId) !== String(req.session.userId)) return sendError(res, 403, "Only the requester can edit this event request");
    const updated = await req.models.EventRequests.findOneAndUpdate({ _id: req.params.id, status: "DRAFT", requesterId: req.session.userId }, { $set: fields }, { new: true, runValidators: true });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    await recordAudit(req, { eventRequestId: req.params.id, cycleId: request.cycleId, action: "draft_saved" });
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/submit", requirePermission("events.requests.edit"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request) || request.status !== "DRAFT") return sendError(res, 409, "Only draft requests can be submitted");
    if (String(request.requesterId) !== String(req.session.userId)) return sendError(res, 403, "Only the requester can submit this event request");
    const updated = await canonicalTransition(req, req.params.id, request, "PVP_REVIEW", { submittedAt: new Date(), submittedBy: req.session.userId }, { action: "submitted" });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    if (error.statusCode) return sendError(res, error.statusCode, error.message);
    console.error(error);
    return sendError(res, 500);
  }
});

router.delete("/:id", requirePermission("events.requests.edit"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request) || request.status !== "DRAFT") return sendError(res, 409, "Only draft requests can be deleted");
    if (String(request.requesterId) !== String(req.session.userId)) return sendError(res, 403, "Only the requester can delete this event request");
    await recordAudit(req, { eventRequestId: req.params.id, cycleId: request.cycleId, action: "draft_deleted", fromStatus: request.status });
    if (typeof req.models.EventRequests.deleteOne === "function") await req.models.EventRequests.deleteOne({ _id: req.params.id, status: "DRAFT", requesterId: req.session.userId });
    return sendSuccess(res);
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/advance", requirePermission("events.leadership.approve"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const agendaDate = parseOptionalDate(req.body?.agendaDate, "agendaDate must be a valid date") || nextAgendaDate();
  if (agendaDate.error) return sendError(res, 400, agendaDate.error);
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request)) return sendError(res, 409, "This request uses the legacy workflow");
    const updated = await canonicalTransition(req, req.params.id, request, "AGENDA", {
      agendaDate,
      pvpDecision: { decision: "advance", actedBy: req.session.userId, actedAt: new Date(), comment: "" },
    }, { action: "pvp_advance" });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    if (error.statusCode) return sendError(res, error.statusCode, error.message);
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/return", requirePermission("events.leadership.approve"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  if (typeof req.body?.comment !== "string" || !req.body.comment.trim()) return sendError(res, 400, "comment is required");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request)) return sendError(res, 409, "This request uses the legacy workflow");
    const updated = await canonicalTransition(req, req.params.id, request, "DRAFT", {
      reviewComments: [...(request.reviewComments || []), { actorId: req.session.userId, comment: req.body.comment.trim(), createdAt: new Date() }],
      pvpDecision: { decision: "return", actedBy: req.session.userId, actedAt: new Date(), comment: req.body.comment.trim() },
    }, { action: "pvp_return", comment: req.body.comment.trim() });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    if (error.statusCode) return sendError(res, error.statusCode, error.message);
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/reject", requirePermission("events.leadership.approve"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  if (typeof req.body?.comment !== "string" || !req.body.comment.trim()) return sendError(res, 400, "comment is required");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request)) return sendError(res, 409, "This request uses the legacy workflow");
    const updated = await canonicalTransition(req, req.params.id, request, "REJECTED", {
      reviewComments: [...(request.reviewComments || []), { actorId: req.session.userId, comment: req.body.comment.trim(), createdAt: new Date() }],
      pvpDecision: { decision: "reject", actedBy: req.session.userId, actedAt: new Date(), comment: req.body.comment.trim() },
    }, { action: "pvp_reject", comment: req.body.comment.trim() });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    if (error.statusCode) return sendError(res, error.statusCode, error.message);
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/agenda-outcome", requirePermission("events.meeting.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { outcome, note } = req.body || {};
  if (!["proceed", "table", "decline"].includes(outcome)) return sendError(res, 400, "outcome must be proceed, table, or decline");
  if (typeof note !== "string" || !note.trim()) return sendError(res, 400, "note is required");
  const nextMeetingDate = parseOptionalDate(req.body?.nextMeetingDate, "nextMeetingDate must be a valid date");
  if (nextMeetingDate?.error) return sendError(res, 400, nextMeetingDate.error);
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request)) return sendError(res, 409, "This request uses the legacy workflow");
    const toStatus = outcome === "proceed" ? "FINANCE_REVIEW" : outcome === "decline" ? "REJECTED" : "AGENDA";
    const updated = await canonicalTransition(req, req.params.id, request, toStatus, {
      agendaDate: outcome === "table" ? (nextMeetingDate || nextAgendaDate()) : request.agendaDate,
      agendaOutcome: { decision: outcome, note: note.trim(), recordedBy: req.session.userId, recordedAt: new Date() },
    }, { action: `agenda_${outcome}`, comment: note.trim() });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    if (error.statusCode) return sendError(res, error.statusCode, error.message);
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/finance", requirePermission("events.finance.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { decision, approvedAmountCents, note = "", confirmOverBudget = false } = req.body || {};
  if (!["approve", "approve_partial", "deny"].includes(decision)) return sendError(res, 400, "decision must be approve, approve_partial, or deny");
  if (typeof note !== "string") return sendError(res, 400, "note must be a string");
  if (typeof confirmOverBudget !== "boolean") return sendError(res, 400, "confirmOverBudget must be a boolean");
  if (decision !== "deny" && !cents(approvedAmountCents)) return sendError(res, 400, "approvedAmountCents must be a non-negative integer");
  if (decision === "approve_partial" && (!note.trim() || approvedAmountCents === undefined)) return sendError(res, 400, "note is required for partial approval");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request)) return sendError(res, 409, "This request uses the legacy workflow");
    const amount = decision === "deny" ? 0 : approvedAmountCents;
    const requestedAmount = request.fundingRequestedCents ?? request.finance?.allocatedCents ?? 0;
    if (decision !== "deny" && amount !== requestedAmount && !note.trim()) return sendError(res, 400, "note is required when the approved amount differs");
    if (confirmOverBudget && !note.trim()) return sendError(res, 400, "note is required to confirm an over-budget approval");
    assertTransition(request.status, decision === "deny" ? "REJECTED" : "MARKETING_QUEUED");
    if (!request.cycleId) return sendError(res, 409, "Event request has no academic year");

    if (typeof req.models.BudgetLedgerEntries?.findOne === "function" && await req.models.BudgetLedgerEntries.findOne({ eventRequestId: req.params.id })) {
      return sendError(res, 409, "Funding has already been decided");
    }

    if (amount > 0) {
      if (typeof req.models.Cycles?.findOneAndUpdate !== "function") return sendError(res, 500);
      const cycleFilter = confirmOverBudget ? { _id: request.cycleId } : {
        _id: request.cycleId,
        $expr: { $lte: [{ $add: [{ $ifNull: ["$budgetCommittedCents", 0] }, amount] }, "$budgetTotalCents"] },
      };
      const cycle = await req.models.Cycles.findOneAndUpdate(cycleFilter, { $inc: { budgetCommittedCents: amount } }, { new: true });
      if (!cycle) return sendError(res, 409, "Approval exceeds the remaining academic-year budget");
    }

    if (typeof req.models.BudgetLedgerEntries?.create === "function") {
      await req.models.BudgetLedgerEntries.create({ cycleId: request.cycleId, eventRequestId: req.params.id, amountCents: amount, decision: decision === "deny" ? "denied" : "approved", decidedBy: req.session.userId, note: note.trim() });
    }
    const updated = await canonicalTransition(req, req.params.id, request, decision === "deny" ? "REJECTED" : "MARKETING_QUEUED", {
      financeDecision: { decision, approvedAmountCents: amount, note: note.trim(), actedBy: req.session.userId, actedAt: new Date() },
      finance: { ...(request.finance || {}), allocatedCents: amount, approvedBy: req.session.userId, approvedAt: new Date(), notes: note.trim() },
    }, { action: `finance_${decision}`, comment: note.trim(), amountCents: amount });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    if (error.statusCode) return sendError(res, error.statusCode, error.message);
    if (error.code === 11000) return sendError(res, 409, "Funding has already been decided");
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/marketing-complete", requirePermission("events.marketing.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request)) return sendError(res, 409, "This request uses the legacy workflow");
    const updated = await canonicalTransition(req, req.params.id, request, "SCHEDULED", {
      marketingCompletedBy: req.session.userId,
      marketingCompletedAt: new Date(),
    }, { action: "marketing_complete" });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    if (error.statusCode) return sendError(res, error.statusCode, error.message);
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/publish", requirePermission("events.publication.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (!canonicalRequest(request) || request.status !== "SCHEDULED") return sendError(res, 409, "Only scheduled requests can be published");
    let event = request.publishedEventId;
    if (!event) {
      event = await req.models.Events.create({
        eName: request.title || request.eventName,
        eOrganizers: request.requestingGroup,
        eStartDate: request.eventDate || request.proposedStartDate,
        eLocation: request.location || request.booking?.location || "TBD",
        eDescription: request.purpose || request.description,
        eRsvpEnabled: request.rsvpEnabled,
        rsvpQuestions: request.rsvpQuestions || [],
      });
    }
    const updated = await req.models.EventRequests.findOneAndUpdate({ _id: req.params.id, status: "SCHEDULED" }, { $set: { publishedEventId: event } }, { new: true, runValidators: true });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    await recordAudit(req, { eventRequestId: req.params.id, cycleId: request.cycleId, action: "published", requesterId: request.requesterId });
    return sendSuccess(res, { eventRequest: updated, event });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id", requirePermission("events.requests.edit"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { fields, error } = readRequestFields(req.body);
  if (error) return sendError(res, 400, error);

  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (String(request.requesterId) !== String(req.session.userId)) {
      return sendError(res, 403, "Only the requester can edit this event request");
    }
    if (!["draft", "changes_requested"].includes(request.status)) {
      return sendError(res, 409, "Only draft or returned requests can be edited");
    }
    const updated = await req.models.EventRequests.findOneAndUpdate(
      { _id: req.params.id, status: request.status, requesterId: req.session.userId },
      {
        $set: {
          ...fields,
          status: "submitted",
          submittedAt: new Date(),
          submittedBy: req.session.userId,
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/templates/slides", requirePermission("events.requests.view"), (_req, res) => {
  try {
    const templates = JSON.parse(process.env.EVENT_SLIDE_TEMPLATES || "[]");
    return sendSuccess(res, {
      templates: Array.isArray(templates) ? templates : [],
    });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/mine", requirePermission("events.requests.view"), async (req, res) => {
  try {
    const requests = await req.models.EventRequests.find({
      requesterId: req.session.userId,
    })
      .sort({ proposedStartDate: 1 })
      .lean();
    return sendSuccess(res, { eventRequests: requests });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/", requirePermission("events.requests.view"), async (req, res) => {
  try {
    const filter = {};
    if (typeof req.query.status === "string") filter.status = req.query.status;
    if (typeof req.query.requesterId === "string") {
      if (!validId(req.query.requesterId)) {
        return sendError(res, 400, "Invalid requester ID");
      }
      filter.requesterId = req.query.requesterId;
    }
    const requests = await req.models.EventRequests.find(filter)
      .sort({ proposedStartDate: 1 })
      .lean();
    return sendSuccess(res, { eventRequests: requests });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/:id", requirePermission("events.requests.view"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (typeof req.models.AuditEntries?.find === "function") {
      request.auditEntries = await req.models.AuditEntries.find({ eventRequestId: req.params.id }).sort({ createdAt: 1 }).populate("actorId", "uDisplayName uEmail").lean();
    }
    return sendSuccess(res, { eventRequest: request });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/:id/audit", requirePermission("events.requests.view"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    const entries = typeof req.models.AuditEntries?.find === "function"
      ? await req.models.AuditEntries.find({ eventRequestId: req.params.id }).sort({ createdAt: 1 }).populate("actorId", "uDisplayName uEmail").lean()
      : [];
    return sendSuccess(res, { auditEntries: entries });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/request-changes", requirePermission("events.leadership.approve"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const error = readReason(req.body, "reason");
  if (error) return sendError(res, 400, error);

  try {
    const request = await transitionRequest(req, req.params.id, LEADERSHIP_STATUSES, {
      status: "changes_requested",
      changesRequestedAt: new Date(),
      changesRequestedBy: req.session.userId,
      changesRequestedReason: req.body.reason.trim(),
    });
    if (!request) return sendError(res, 409, "Event request is not awaiting leadership review");
    return sendSuccess(res, { eventRequest: request });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/deny", requirePermission("events.leadership.approve"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const error = readReason(req.body, "reason");
  if (error) return sendError(res, 400, error);

  try {
    const request = await transitionRequest(req, req.params.id, LEADERSHIP_STATUSES, {
      status: "denied",
      deniedAt: new Date(),
      deniedBy: req.session.userId,
      denialReason: req.body.reason.trim(),
    });
    if (!request) return sendError(res, 409, "Event request is not awaiting leadership review");
    return sendSuccess(res, { eventRequest: request });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/approve", requirePermission("events.leadership.approve"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");

  try {
    const eventRequest = await findRequest(req, req.params.id);
    if (!eventRequest) return sendError(res, 404, "Event request not found");
    if (!LEADERSHIP_STATUSES.includes(eventRequest.status)) {
      return sendError(res, 409, "Event request is not awaiting leadership review");
    }

    const event = await req.models.Events.create({
      eName: eventRequest.eventName,
      eOrganizers: eventRequest.requestingGroup,
      eStartDate: eventRequest.proposedStartDate,
      eEndDate: eventRequest.proposedEndDate,
      eLocation: eventRequest.booking?.location || "TBD",
      eDescription: eventRequest.description,
      eRsvpEnabled: eventRequest.rsvpEnabled,
      rsvpQuestions: eventRequest.rsvpQuestions || [],
    });
    const updated = await transitionRequest(req, req.params.id, LEADERSHIP_STATUSES, {
      status: "approved",
      approvedAt: new Date(),
      approvedBy: req.session.userId,
      publishedEventId: event._id,
      checkpoints: completeCheckpoint(
        eventRequest.checkpoints,
        "proposal",
        req.session.userId,
      ),
    });
    if (!updated) {
      if (req.models.Events.deleteOne) await req.models.Events.deleteOne({ _id: event._id });
      return sendError(res, 409, "Event request was already reviewed");
    }
    return sendSuccess(res, { eventRequest: updated, event });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id/checklist/:step", requireCheckpointPermission, async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  if (!CHECKPOINT_KEYS.includes(req.params.step)) return sendError(res, 400, "Invalid checkpoint");
  if (!CHECKPOINT_STATUSES.has(req.body.status)) return sendError(res, 400, "Invalid checkpoint status");
  if (req.body.notes !== undefined && typeof req.body.notes !== "string") {
    return sendError(res, 400, "notes must be a string");
  }
  if (req.body.link !== undefined && typeof req.body.link !== "string") {
    return sendError(res, 400, "link must be a string");
  }

  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (["denied", "cancelled", "completed"].includes(request.status)) {
      return sendError(res, 409, "Event request is closed");
    }
    const checkpoints = (request.checkpoints || []).map((checkpoint) => ({ ...checkpoint }));
    const index = checkpoints.findIndex((checkpoint) => checkpoint.key === req.params.step);
    const checkpoint = index === -1 ? { key: req.params.step } : checkpoints[index];
    checkpoint.status = req.body.status;
    if (req.body.notes !== undefined) checkpoint.notes = req.body.notes.trim();
    if (req.body.link !== undefined) checkpoint.link = req.body.link.trim();
    checkpoint.updatedBy = req.session.userId;
    checkpoint.updatedAt = new Date();
    if (req.body.status === "completed") {
      checkpoint.completedBy = req.session.userId;
      checkpoint.completedAt = new Date();
    } else {
      checkpoint.completedBy = null;
      checkpoint.completedAt = null;
    }
    if (index === -1) checkpoints.push(checkpoint);

    const updated = await req.models.EventRequests.findOneAndUpdate(
      { _id: req.params.id, status: request.status },
      { $set: { checkpoints } },
      { new: true, runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id/budget", requirePermission("events.finance.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { allocatedCents, actualSpendCents, notes } = req.body ?? {};
  if (allocatedCents !== undefined && !cents(allocatedCents)) {
    return sendError(res, 400, "allocatedCents must be a non-negative integer");
  }
  if (actualSpendCents !== undefined && !cents(actualSpendCents)) {
    return sendError(res, 400, "actualSpendCents must be a non-negative integer");
  }
  if (notes !== undefined && typeof notes !== "string") return sendError(res, 400, "notes must be a string");

  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (["denied", "cancelled"].includes(request.status)) return sendError(res, 409, "Event request is closed");
    const finance = {
      ...(request.finance || {}),
      ...(allocatedCents !== undefined && { allocatedCents }),
      ...(actualSpendCents !== undefined && { actualSpendCents }),
      ...(notes !== undefined && { notes: notes.trim() }),
      approvedBy: req.session.userId,
      approvedAt: new Date(),
    };
    const updated = await req.models.EventRequests.findOneAndUpdate(
      { _id: req.params.id, status: request.status },
      {
        $set: {
          finance,
          ...(allocatedCents !== undefined && {
            checkpoints: completeCheckpoint(
              request.checkpoints,
              "finance",
              req.session.userId,
            ),
          }),
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id/review-tracking", requirePermission("events.review.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { reviewLink, received } = req.body ?? {};
  if (reviewLink !== undefined && (typeof reviewLink !== "string" || reviewLink.trim().length > 1000)) {
    return sendError(res, 400, "reviewLink must be 1000 characters or fewer");
  }
  if (received !== undefined && typeof received !== "boolean") {
    return sendError(res, 400, "received must be a boolean");
  }

  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    const update = {};
    if (reviewLink !== undefined) update.reviewLink = reviewLink.trim();
    if (received !== undefined) {
      update.reviewReceivedAt = received ? new Date() : null;
      update.reviewReceivedBy = received ? req.session.userId : null;
    }
    const updated = await req.models.EventRequests.findOneAndUpdate(
      { _id: req.params.id, status: request.status },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id/booking", requirePermission("events.room.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { location, startDate, endDate, notes } = req.body ?? {};
  if (location !== undefined && (typeof location !== "string" || !location.trim())) {
    return sendError(res, 400, "location must be a non-empty string");
  }
  const start = startDate === undefined ? undefined : new Date(startDate);
  const end = endDate === undefined ? undefined : new Date(endDate);
  if (start && Number.isNaN(start.getTime())) return sendError(res, 400, "Invalid booking start date");
  if (end && (Number.isNaN(end.getTime()) || (start && end < start))) {
    return sendError(res, 400, "Invalid booking end date");
  }
  if (notes !== undefined && typeof notes !== "string") return sendError(res, 400, "notes must be a string");

  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (["denied", "cancelled", "completed"].includes(request.status)) return sendError(res, 409, "Event request is closed");
    const booking = {
      ...(request.booking || {}),
      ...(location !== undefined && { location: location.trim() }),
      ...(start && { startDate: start }),
      ...(end && { endDate: end }),
      ...(notes !== undefined && { notes: notes.trim() }),
      bookedBy: req.session.userId,
      bookedAt: new Date(),
    };
    const updated = await req.models.EventRequests.findOneAndUpdate(
      { _id: req.params.id, status: request.status },
      { $set: { booking } },
      { new: true, runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/reviews", requirePermission("events.review.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { attendeeCount, whatWentWell, whatMissedExpectations, totalSpentCents, locationReview, timingReview, extenuatingCircumstances, pros, cons, actualAttendance, repeatRecommendation } = req.body ?? {};
  if (actualAttendance !== undefined && (!Number.isInteger(actualAttendance) || actualAttendance < 0)) {
    return sendError(res, 400, "actualAttendance must be a non-negative integer");
  }
  if (repeatRecommendation !== undefined && !["yes", "no", "with_changes"].includes(repeatRecommendation)) {
    return sendError(res, 400, "repeatRecommendation must be yes, no, or with_changes");
  }
  if (attendeeCount !== undefined && (!Number.isInteger(attendeeCount) || attendeeCount < 0)) {
    return sendError(res, 400, "attendeeCount must be a non-negative integer");
  }
  if (totalSpentCents !== undefined && !cents(totalSpentCents)) {
    return sendError(res, 400, "totalSpentCents must be a non-negative integer");
  }

  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (canonicalRequest(request)) {
      if (String(request.requesterId) !== String(req.session.userId)) return sendError(res, 403, "Only the requester can submit this review");
      if (request.status === "SCHEDULED" && new Date(request.eventDate || request.proposedStartDate) <= new Date()) {
        const awaiting = await canonicalTransition(req, req.params.id, request, "AWAITING_REVIEW", {}, { action: "review_due" });
        if (!awaiting) return sendError(res, 409, "Event request changed; retry the update");
        request.status = awaiting.status;
      }
      if (request.status !== "AWAITING_REVIEW") return sendError(res, 409, "Event is not awaiting review");
      if (typeof pros !== "string" || !pros.trim() || typeof cons !== "string" || !cons.trim() || actualAttendance === undefined || repeatRecommendation === undefined) {
        return sendError(res, 400, "pros, cons, actualAttendance, and repeatRecommendation are required");
      }
      const review = await req.models.EventReviews.create({
        eventRequestId: req.params.id,
        reviewerId: req.session.userId,
        reviewerRole: "organizer",
        pros: pros.trim(),
        cons: cons.trim(),
        actualAttendance,
        attendeeCount: actualAttendance,
        repeatRecommendation,
      });
      const updated = await canonicalTransition(req, req.params.id, request, "REVIEWED", {
        reviewReceivedAt: new Date(),
        reviewReceivedBy: req.session.userId,
      }, { action: "review_submitted" });
      if (!updated) return sendError(res, 409, "Event request changed; retry the update");
      return res.status(201).json({ status: "success", review, eventRequest: updated });
    }
    if (!["approved", "completed"].includes(request.status)) return sendError(res, 409, "Event is not ready for review");
    const reviewerRole = String(request.organizerId) === String(req.session.userId) ? "organizer" : "member";
    const existing = await req.models.EventReviews.findOne({ eventRequestId: req.params.id, reviewerId: req.session.userId });
    if (existing) return sendError(res, 409, "You already submitted a review");
    const review = await req.models.EventReviews.create({
      eventRequestId: req.params.id,
      reviewerId: req.session.userId,
      reviewerRole,
      attendeeCount,
      whatWentWell,
      whatMissedExpectations,
      totalSpentCents,
      locationReview,
      timingReview,
      extenuatingCircumstances,
      pros,
      cons,
      actualAttendance,
      repeatRecommendation,
    });
    const reviews = await req.models.EventReviews.find({
      eventRequestId: req.params.id,
    }).lean();
    if (reviews.length >= 2) {
      await req.models.EventRequests.findByIdAndUpdate(req.params.id, {
        $set: { "checkpoints.$[checkpoint].status": "completed", "checkpoints.$[checkpoint].completedBy": req.session.userId, "checkpoints.$[checkpoint].completedAt": new Date() },
      }, { arrayFilters: [{ "checkpoint.key": "review" }] });
    }
    return res.status(201).json({ status: "success", review });
  } catch (error) {
    if (error.code === 11000) return sendError(res, 409, "Review already submitted for this role");
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/:id/reviews", requirePermission("events.review.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const reviews = await req.models.EventReviews.find({ eventRequestId: req.params.id }).lean();
    return sendSuccess(res, { reviews });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/complete", requirePermission("events.operations.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    if (request.status !== "approved") return sendError(res, 409, "Only approved events can be completed");
    const reviews = await req.models.EventReviews.find({
      eventRequestId: req.params.id,
    }).lean();
    const roles = new Set(reviews.map((review) => review.reviewerRole));
    if (!roles.has("organizer") || !roles.has("member")) {
      return sendError(res, 409, "Organizer and member reviews are required");
    }
    const incomplete = (request.checkpoints || []).some((checkpoint) => checkpoint.status !== "completed");
    if (incomplete) return sendError(res, 409, "All event checkpoints must be completed");
    const updated = await transitionRequest(req, req.params.id, ["approved"], {
      status: "completed",
      completedAt: new Date(),
      completedBy: req.session.userId,
    });
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

export default router;
