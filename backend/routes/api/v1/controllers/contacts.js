import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";

const router = express.Router();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readContactFields(body = {}, partial = false) {
  const fields = {};
  for (const key of ["name", "organization", "role", "contactMethod", "notes"]) {
    if (!partial || body[key] !== undefined) {
      if (typeof body[key] !== "string" || (!partial && body[key].trim() === "")) return { error: `${key} is required` };
      fields[key] = body[key].trim();
    }
  }
  if (!partial || body.engagementTypes !== undefined) {
    if (!Array.isArray(body.engagementTypes) || body.engagementTypes.some((type) => typeof type !== "string")) return { error: "engagementTypes must be an array of strings" };
    fields.engagementTypes = body.engagementTypes.map((type) => type.trim()).filter(Boolean);
  }
  if (!partial || body.eventIds !== undefined) {
    if (!Array.isArray(body.eventIds) || body.eventIds.some((id) => !mongoose.isValidObjectId(id))) return { error: "eventIds must contain valid event IDs" };
    fields.eventIds = body.eventIds;
  }
  return { fields };
}

router.get("/", requirePermission("contacts.read"), async (req, res) => {
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const filter = search ? {
    $or: ["name", "organization", "notes"].map((field) => ({ [field]: new RegExp(escapeRegex(search), "i") })),
  } : {};
  try {
    const contacts = await req.models.Contacts.find(filter)
      .populate("eventIds", "eName eStartDate eLocation")
      .populate("relationshipOwnerId", "uDisplayName uEmail")
      .sort({ organization: 1, name: 1 })
      .lean();
    return sendSuccess(res, { contacts });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/", requirePermission("contacts.manage"), async (req, res) => {
  const { fields, error } = readContactFields(req.body);
  if (error) return sendError(res, 400, error);
  try {
    const contact = await req.models.Contacts.create({ ...fields, relationshipOwnerId: req.session.userId });
    return res.status(201).json({ status: "success", contact });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id", requirePermission("contacts.manage"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 400, "Invalid contact ID");
  const { fields, error } = readContactFields(req.body, true);
  if (error) return sendError(res, 400, error);
  try {
    const contact = await req.models.Contacts.findByIdAndUpdate(req.params.id, { $set: fields }, { new: true, runValidators: true });
    if (!contact) return sendError(res, 404, "Contact not found");
    return sendSuccess(res, { contact });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

export default router;
