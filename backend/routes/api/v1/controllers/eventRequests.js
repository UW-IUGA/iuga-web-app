/*
* Purpose: Serve the event request workflow: an officer proposes an event, leadership reviews it, and
* the request then moves through booking, finance, the checklist, and the post-event reviews until it
* is complete.
* Authentication/Authorization Requirements: An administrator for most routes. Three checklist steps
* have their own permission — approving a proposal, managing finances, and completing purchases — and
* every other step is administrator-only.
* Expected Request Information: The request's own fields for a new or edited request; per-step
* payloads for the rest, such as a reason, a checklist status, money amounts, or review answers.
* Expected Response Information: The API envelope carrying the event request, an event, or reviews.
* 400 for an unusable field, 403 when the caller may not act, 404 when there is no such request, 409
* when the request is not in a state that allows the action.
*/

import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requireAdmin, requireOfficerRolePermission } from "../utils/auth.js";
import { isWholeCents } from "../../../../utils/money.js";

const router = express.Router();
// The steps every event request moves through, in the order they appear on its checklist.
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

/*
 * @behavior Check that a value could be a MongoDB record id.
 * @param value — the value to check
 * @returns true when MongoDB would accept the value as a record id
 */
function validId(value) {
  return mongoose.isValidObjectId(value);
}

/*
 * @behavior Read and check the RSVP questions for an event request, trimming each one.
 * @param value — the questions as they arrived
 * @returns { fields } holding the trimmed questions, or { error } with a message for the client
 */
function readRsvpQuestions(value) {
  if (!Array.isArray(value)) return { error: "rsvpQuestions must be an array" };

  const questions = [];
  for (const [index, question] of value.entries()) {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
      return { error: `rsvpQuestions[${index}] must be an object` };
    }
    if (
      typeof question.qId !== "string" ||
      question.qId.trim() === "" ||
      question.qId.trim().length > 100
    ) {
      return {
        error: `rsvpQuestions[${index}].qId must be a non-empty string of 100 characters or fewer`,
      };
    }
    if (
      typeof question.qString !== "string" ||
      question.qString.trim() === "" ||
      question.qString.trim().length > 500
    ) {
      return {
        error: `rsvpQuestions[${index}].qString must be a non-empty string of 500 characters or fewer`,
      };
    }
    questions.push({
      qId: question.qId.trim(),
      qString: question.qString.trim(),
    });
  }

  return { fields: questions };
}

/*
 * @behavior Read a moment from text, reporting nothing when the text is not a date.
 * @param value — the text to read
 * @returns the moment as a Date, or null when the value is blank or not a date
 */
function readDate(value) {
  if (typeof value !== "string" || value.trim() === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}


/*
 * @behavior Build the checklist an event request starts with: every step, none of them done.
 * @returns one { key, status } entry per step, all pending
 */
function defaultCheckpoints() {
  return CHECKPOINT_KEYS.map((key) => ({ key, status: "pending" }));
}

/*
 * @behavior Read and check the fields of a submitted or edited event request, trimming text and
 *           keeping only the fields the caller actually sent.
 * @param body — the request body as it arrived
 * @returns { fields } holding the checked fields, or { error } with a message for the client
 */
function readRequestFields(body = {}) {
  body ??= {};
  if (typeof body !== "object" || Array.isArray(body)) {
    return { error: "Event request body must be an object" };
  }

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

  const start = readDate(body.proposedStartDate);
  if (!start) {
    return { error: "proposedStartDate must be a valid date" };
  }
  fields.proposedStartDate = start;

  if (body.proposedEndDate !== undefined && body.proposedEndDate !== null) {
    const end = readDate(body.proposedEndDate);
    if (!end || end < start) {
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
    const questions = readRsvpQuestions(body.rsvpQuestions);
    if (questions.error) return questions;
    fields.rsvpQuestions = questions.fields;
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

/*
 * @behavior Read the reason a reviewer has to give when returning or denying a request.
 * @param body — the request body as it arrived
 * @param name — which field the reason is read from
 * @returns null when the reason is usable, otherwise a message for the client
 */
function readReason(body = {}, name = "reason") {
  if (typeof body[name] !== "string" || body[name].trim() === "") {
    return `${name} is required`;
  }
  if (body[name].trim().length > 2000) return `${name} is too long`;
  return null;
}

/*
 * @behavior Mark one checklist step done, recording who did it and when, and leaving every other
 *           step as it was.
 * @param checkpoints — the request's current checklist
 * @param key — the step to mark done
 * @param actorId — the user who did the step
 * @returns a new checklist; the one passed in is left untouched
 */
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

/*
 * @behavior Load one event request with its requester, organizer, and published event filled in.
 * @param req — the Express request, for the shared models
 * @param id — the event request id
 * @returns the event request as a plain object, or null when there is no such request
 */
async function findRequest(req, id) {
  return req.models.EventRequests.findById(id)
    .populate("requesterId organizerId publishedEventId")
    .lean();
}

/*
 * @behavior Move an event request to a new status, but only out of one of the statuses allowed. Two
 *           reviewers acting at the same time therefore produce one change, not two.
 * @param req — the Express request, for the shared models
 * @param id — the event request id
 * @param statuses — the statuses the request may be in for this change to be allowed
 * @param update — the fields to write
 * @returns the updated event request, or null when it was not in one of those statuses
 */
async function transitionRequest(req, id, statuses, update) {
  return req.models.EventRequests.findOneAndUpdate(
    { _id: id, status: { $in: statuses } },
    { $set: update },
    { returnDocument: "after", runValidators: true },
  );
}

/*
 * @behavior Choose who may update the checklist step named in the URL: approving the proposal,
 *           managing finances, and completing purchases each need their own permission, and every
 *           other step needs an administrator.
 * @param req — the Express request; req.params.step names the step
 * @param res — the Express response
 * @param next — continues to the route handler when the caller may do this
 * @returns nothing; answers 401, answers 403, or continues
 */
async function requireCheckpointPermission(req, res, next) {
  const permission = {
    proposal: "events.leadership.approve",
    finance: "events.finance.manage",
    purchases: "events.purchases.complete",
  }[req.params.step];
  if (permission) return requireOfficerRolePermission(permission)(req, res, next);
  return requireAdmin(req, res, next);
}

/*
 * @behavior Record a new event request from its fields, with every checklist step still pending.
 * @param req — the Express request; the body carries the proposed event
 * @param res — the Express response
 * @returns nothing; answers 201 with the new request, 400 when a field is unusable, or 500 when the
 *          save fails
 */
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

/*
 * @behavior Let the requester change their own request while it is a draft or has been returned for
 *           changes, and send it back for review. The write only applies while the request still
 *           has the status it was read with, so a request reviewed in the meantime is not
 *           overwritten.
 * @param req — the Express request; the body carries the changed fields
 * @param res — the Express response
 * @returns nothing; answers 200 with the saved request, 400 for an invalid id or unusable field, 403
 *          when the caller is not the requester, 404 when there is no such request, 409 when it is
 *          no longer editable or someone changed it first, or 500 when the save fails
 */
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
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior List the slide templates an event request may choose from.
 * @param req — the Express request
 * @param res — the Express response
 * @returns nothing; answers 200 with the templates configured for this deployment, an empty list
 *          when none are configured, or 500 when that configuration cannot be read
 */
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

/*
 * @behavior List the event requests this user submitted, soonest planned event first.
 * @param req — the Express request
 * @param res — the Express response
 * @returns nothing; answers 200 with the list, or 500 when the lookup fails
 */
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

/*
 * @behavior List event requests, soonest planned event first, optionally narrowed to one status or
 *           to one requester.
 * @param req — the Express request; req.query.status and req.query.requesterId narrow the list
 * @param res — the Express response
 * @returns nothing; answers 200 with the list, 400 when the requester id is not a valid id, or 500
 *          when the lookup fails
 */
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

/*
 * @behavior Read one event request, with its requester, organizer, and published event filled in.
 * @param req — the Express request; req.params.id names the request
 * @param res — the Express response
 * @returns nothing; answers 200 with the request, 400 when the id is invalid, 404 when there is no
 *          such request, or 500 when the lookup fails
 */
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

/*
 * @behavior Return an event request to the requester and record why.
 * @param req — the Express request; the body carries the reason
 * @param res — the Express response
 * @returns nothing; answers 200 with the updated request, 400 for an invalid id or a missing reason,
 *          409 when the request is no longer waiting for leadership, or 500 when the update fails
 */
router.post("/:id/request-changes", requireOfficerRolePermission("events.leadership.approve"), async (req, res) => {
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

/*
 * @behavior Deny an event request and record why.
 * @param req — the Express request; the body carries the reason
 * @param res — the Express response
 * @returns nothing; answers 200 with the updated request, 400 for an invalid id or a missing reason,
 *          409 when the request is no longer waiting for leadership, or 500 when the update fails
 */
router.post("/:id/deny", requireOfficerRolePermission("events.leadership.approve"), async (req, res) => {
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

/*
 * @behavior Approve an event request and create the event from it. If someone else reviewed the
 *           request first, the event that was just created is removed again, so approval cannot
 *           produce a second event.
 * @param req — the Express request
 * @param res — the Express response
 * @returns nothing; answers 200 with the request and the new event, 400 for an invalid id, 404 when
 *          there is no such request, 409 when it is no longer waiting for leadership or was reviewed
 *          first, or 500 when the write fails
 */
router.post("/:id/approve", requireOfficerRolePermission("events.leadership.approve"), async (req, res) => {
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

/*
 * @behavior Update one checklist step: its status, its notes, and a link, recording who changed it
 *           and when.
 * @param req — the Express request; req.params.step names the step and the body carries the change
 * @param res — the Express response
 * @returns nothing; answers 200 with the updated request, 400 for an invalid id, an unknown step, or
 *          an unusable status, notes, or link, 404 when there is no such request, 409 when the
 *          request is already closed or someone changed it first, or 500 when the update fails
 */
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
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Record the money allocated to an event and what it actually cost, and mark the finance
 *           step done once an allocation is set.
 * @param req — the Express request; the body carries allocatedCents, actualSpendCents, and notes
 * @param res — the Express response
 * @returns nothing; answers 200 with the updated request, 400 for an invalid id or amount, 404 when
 *          there is no such request, 409 when the request is closed or someone changed it first, or
 *          500 when the update fails
 */
router.patch("/:id/budget", requireOfficerRolePermission("events.finance.manage"), async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { allocatedCents, actualSpendCents, notes } = req.body ?? {};
  if (allocatedCents !== undefined && !isWholeCents(allocatedCents)) {
    return sendError(res, 400, "allocatedCents must be a non-negative integer");
  }
  if (actualSpendCents !== undefined && !isWholeCents(actualSpendCents)) {
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
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Record whether the post-event review has come back, and where it lives.
 * @param req — the Express request; the body carries reviewLink and received
 * @param res — the Express response
 * @returns nothing; answers 200 with the updated request, 400 for an invalid id, link, or flag, 404
 *          when there is no such request, 409 when someone changed it first, or 500 when the update
 *          fails
 */
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
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Record where and when the event is booked.
 * @param req — the Express request; the body carries location, startDate, endDate, and notes
 * @param res — the Express response
 * @returns nothing; answers 200 with the updated request, 400 for an invalid id, location, or date,
 *          404 when there is no such request, 409 when the request is closed or someone changed it
 *          first, or 500 when the update fails
 */
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
      { returnDocument: "after", runValidators: true },
    );
    if (!updated) return sendError(res, 409, "Event request changed; retry the update");
    return sendSuccess(res, { eventRequest: updated });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Add this user's review of a finished event. The second review completes the review step
 *           on the checklist.
 * @param req — the Express request; the body carries the review answers
 * @param res — the Express response
 * @returns nothing; answers 201 with the review, 400 for an invalid id or review count, 404 when
 *          there is no such request, 409 when the event is not ready for review or this user has
 *          already reviewed it, or 500 when the write fails
 */
router.post("/:id/reviews", requireAdmin, async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 400, "Invalid event request ID");
  const { attendeeCount, whatWentWell, whatMissedExpectations, totalSpentCents, locationReview, timingReview, extenuatingCircumstances } = req.body ?? {};
  if (attendeeCount !== undefined && (!Number.isInteger(attendeeCount) || attendeeCount < 0)) {
    return sendError(res, 400, "attendeeCount must be a non-negative integer");
  }
  if (totalSpentCents !== undefined && !isWholeCents(totalSpentCents)) {
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

/*
 * @behavior List the reviews submitted for one event.
 * @param req — the Express request; req.params.id names the event request
 * @param res — the Express response
 * @returns nothing; answers 200 with the reviews, 400 when the id is invalid, or 500 when the lookup
 *          fails
 */
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

/*
 * @behavior Close out an approved event, once an organizer and a member have both reviewed it and
 *           every checklist step is done.
 * @param req — the Express request
 * @param res — the Express response
 * @returns nothing; answers 200 with the completed request, 400 for an invalid id, 404 when there is
 *          no such request, 409 when the request is not approved or the reviews or checklist steps
 *          are still missing, or 500 when the update fails
 */
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
