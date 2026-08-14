import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requireAdmin, requirePermission } from "../utils/auth.js";

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

function validId(value) {
  return mongoose.isValidObjectId(value);
}

function defaultCheckpoints() {
  return CHECKPOINT_KEYS.map((key) => ({ key, status: "pending" }));
}

function readRequestFields(body = {}) {
  const fields = {};
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

  return { fields };
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
    purchases: "events.purchases.complete",
  }[req.params.step];
  if (permission) return requirePermission(permission)(req, res, next);
  return requireAdmin(req, res, next);
}

router.post("/", requireAdmin, async (req, res) => {
  const { fields, error } = readRequestFields(req.body);
  if (error) return sendError(res, 400, error);

  try {
    const request = await req.models.EventRequests.create({
      ...fields,
      requesterId: req.session.userId,
      organizerId: req.session.userId,
      submittedBy: req.session.userId,
      submittedAt: new Date(),
      status: "submitted",
      checkpoints: defaultCheckpoints(),
    });
    return res.status(201).json({ status: "success", eventRequest: request });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id", requireAdmin, async (req, res) => {
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

router.get("/templates/slides", requireAdmin, (_req, res) => {
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

router.get("/mine", requireAdmin, async (req, res) => {
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

router.get("/", requireAdmin, async (req, res) => {
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

router.get("/:id", requireAdmin, async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
    return sendSuccess(res, { eventRequest: request });
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

router.patch("/:id/review-tracking", requireAdmin, async (req, res) => {
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

router.patch("/:id/booking", requireAdmin, async (req, res) => {
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

router.post("/:id/reviews", requireAdmin, async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { attendeeCount, whatWentWell, whatMissedExpectations, totalSpentCents, locationReview, timingReview, extenuatingCircumstances } = req.body ?? {};
  if (attendeeCount !== undefined && (!Number.isInteger(attendeeCount) || attendeeCount < 0)) {
    return sendError(res, 400, "attendeeCount must be a non-negative integer");
  }
  if (totalSpentCents !== undefined && !cents(totalSpentCents)) {
    return sendError(res, 400, "totalSpentCents must be a non-negative integer");
  }

  try {
    const request = await findRequest(req, req.params.id);
    if (!request) return sendError(res, 404, "Event request not found");
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

router.get("/:id/reviews", requireAdmin, async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  try {
    const reviews = await req.models.EventReviews.find({ eventRequestId: req.params.id }).lean();
    return sendSuccess(res, { reviews });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/:id/complete", requireAdmin, async (req, res) => {
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
