import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";

const router = express.Router();

function readCycleFields(body = {}) {
  const { cycleKey, cycleName, startsAt, endsAt, budgetTotalCents = 0 } = body;
  if (typeof cycleKey !== "string" || cycleKey.trim() === "") {
    return { error: "cycleKey is required" };
  }
  if (typeof cycleName !== "string" || cycleName.trim() === "") {
    return { error: "cycleName is required" };
  }

  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { error: "endsAt must be a valid date after startsAt" };
  }
  if (!Number.isInteger(budgetTotalCents) || budgetTotalCents < 0) {
    return { error: "budgetTotalCents must be a non-negative integer" };
  }

  return {
    fields: {
      cycleKey: cycleKey.trim(),
      cycleName: cycleName.trim(),
      startsAt: start,
      endsAt: end,
      budgetTotalCents,
    },
  };
}

router.get("/", requirePermission("users.cycles.manage"), async (req, res) => {
  try {
    const cycles = await req.models.Cycles.find().sort({ startsAt: -1 }).lean();
    return sendSuccess(res, { cycles });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.post("/", requirePermission("users.cycles.manage"), async (req, res) => {
  const { fields, error } = readCycleFields(req.body);
  if (error) return sendError(res, 400, error);

  try {
    const cycle = await req.models.Cycles.create({
      ...fields,
      createdBy: req.session.userId,
    });
    return res.status(201).json({ status: "success", cycle });
  } catch (err) {
    if (err.code === 11000) return sendError(res, 409, "Duplicate cycle key");
    console.error(err);
    return sendError(res, 500);
  }
});

router.get("/:id/ledger", requirePermission("events.finance.manage"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 400, "Invalid cycle ID");
  try {
    const entries = typeof req.models.BudgetLedgerEntries?.find === "function"
      ? await req.models.BudgetLedgerEntries.find({ cycleId: req.params.id }).sort({ decidedAt: -1 }).populate("eventRequestId", "title eventName fundingRequestedCents").populate("decidedBy", "uDisplayName uEmail").lean()
      : [];
    return sendSuccess(res, { entries });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch(
  "/:id/close",
  requirePermission("cycles.archive"),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return sendError(res, 400, "Invalid cycle ID");
    }

    try {
      const cycle = await req.models.Cycles.findOneAndUpdate(
        { _id: req.params.id, status: { $ne: "closed" } },
        {
          $set: {
            status: "closed",
            closedBy: req.session.userId,
            closedAt: new Date(),
          },
        },
        { new: true, runValidators: true },
      );
      if (!cycle) return sendError(res, 404, "Open cycle not found");
      if (typeof req.models.EventRequests?.find === "function") {
        const requests = await req.models.EventRequests.find({ cycleId: req.params.id, status: "REVIEWED" }).lean();
        for (const request of requests) {
          const archived = await req.models.EventRequests.findOneAndUpdate(
            { _id: request._id, status: "REVIEWED" },
            { $set: { status: "ARCHIVED" } },
            { new: true, runValidators: true },
          );
          if (archived && typeof req.models.AuditEntries?.create === "function") {
            await req.models.AuditEntries.create({ eventRequestId: request._id, cycleId: req.params.id, actorId: req.session.userId, action: "archived", fromStatus: "REVIEWED", toStatus: "ARCHIVED" });
          }
        }
      }
      return sendSuccess(res, { cycle });
    } catch (error) {
      console.error(error);
      return sendError(res, 500);
    }
  },
);

export default router;
