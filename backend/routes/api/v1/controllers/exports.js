import express from "express";
import { sendError } from "../helpers/sendError.js";
import { requirePermission } from "../utils/auth.js";

const router = express.Router();

function csvValue(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function sendCsv(res, filename, columns, rows) {
  const body = [columns.map(([, label]) => label), ...rows.map((row) => columns.map(([key]) => csvValue(row[key])))]
    .map((line) => line.join(","))
    .join("\n");
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send(`${body}\n`);
}

router.get("/event-requests.csv", requirePermission("exports.manage"), async (req, res) => {
  try {
    const rows = await req.models.EventRequests.find(req.query.cycleId ? { cycleId: req.query.cycleId } : {}).sort({ proposedStartDate: 1 }).lean();
    return sendCsv(res, "event-requests.csv", [["eventName", "Event"], ["status", "Status"], ["proposedStartDate", "Event date"], ["requestingGroup", "Group"], ["fundingRequestedCents", "Funding requested (cents)"], ["updatedAt", "Updated"]], rows);
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/reviews.csv", requirePermission("exports.manage"), async (req, res) => {
  try {
    const rows = await req.models.EventReviews.find(req.query.eventRequestId ? { eventRequestId: req.query.eventRequestId } : {}).sort({ createdAt: 1 }).lean();
    return sendCsv(res, "event-reviews.csv", [["eventRequestId", "Event request"], ["reviewerId", "Reviewer"], ["actualAttendance", "Actual attendance"], ["repeatRecommendation", "Repeat recommendation"], ["pros", "Pros"], ["cons", "Cons"], ["createdAt", "Created"]], rows);
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/budget-ledger.csv", requirePermission("exports.manage"), async (req, res) => {
  try {
    const rows = await req.models.BudgetLedgerEntries.find(req.query.cycleId ? { cycleId: req.query.cycleId } : {}).sort({ decidedAt: 1 }).lean();
    return sendCsv(res, "budget-ledger.csv", [["cycleId", "Academic year"], ["eventRequestId", "Event request"], ["amountCents", "Amount (cents)"], ["decision", "Decision"], ["decidedBy", "Decider"], ["decidedAt", "Decision date"], ["note", "Note"]], rows);
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

export default router;
