import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";
import { getActiveCycle } from "../utils/permissions.js";

const router = express.Router();

function readEntryFields(body = {}) {
  const entryDate = new Date(body.entryDate);
  if (Number.isNaN(entryDate.getTime())) return { error: "entryDate must be a valid date" };
  if (typeof body.body !== "string" || body.body.trim() === "") return { error: "body is required" };
  if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== "string"))) {
    return { error: "tags must be an array of strings" };
  }
  return {
    fields: {
      entryDate,
      body: body.body.trim(),
      tags: (body.tags || []).map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    },
  };
}

router.get("/", requirePermission("journal.read"), async (req, res) => {
  const filter = {};
  if (typeof req.query.authorId === "string") {
    if (!mongoose.isValidObjectId(req.query.authorId)) return sendError(res, 400, "Invalid author ID");
    filter.authorId = req.query.authorId;
  }
  if (typeof req.query.tag === "string" && req.query.tag.trim()) filter.tags = req.query.tag.trim().toLowerCase();
  if (req.query.startDate || req.query.endDate) {
    filter.entryDate = {};
    if (req.query.startDate) filter.entryDate.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.entryDate.$lte = new Date(req.query.endDate);
  }

  try {
    const entries = await req.models.JournalEntries.find(filter)
      .sort({ entryDate: -1, createdAt: -1 })
      .populate("authorId", "uDisplayName uEmail")
      .lean();
    return sendSuccess(res, { entries });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/", requirePermission("journal.create"), async (req, res) => {
  const { fields, error } = readEntryFields(req.body);
  if (error) return sendError(res, 400, error);

  try {
    const cycle = await getActiveCycle(req);
    const entry = await req.models.JournalEntries.create({
      ...fields,
      authorId: req.session.userId,
      cycleId: cycle?._id ?? null,
    });
    return res.status(201).json({ status: "success", entry });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id", requirePermission("journal.edit_own"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 400, "Invalid journal entry ID");
  const { fields, error } = readEntryFields(req.body);
  if (error) return sendError(res, 400, error);

  try {
    const entry = await req.models.JournalEntries.findOneAndUpdate(
      { _id: req.params.id, authorId: req.session.userId },
      { $set: fields },
      { new: true, runValidators: true },
    );
    if (!entry) return sendError(res, 404, "Journal entry not found");
    return sendSuccess(res, { entry });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

export default router;
