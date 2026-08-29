import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";
import { getEffectivePermissions } from "../utils/permissions.js";

const router = express.Router();

function roleRecipients(permissions) {
  const roles = [];
  if (permissions.includes("events.leadership.approve")) roles.push("president_or_vice_president");
  if (permissions.includes("events.meeting.manage")) roles.push("exec_board");
  if (permissions.includes("events.finance.manage")) roles.push("director_of_finance");
  if (permissions.includes("events.marketing.manage")) roles.push("director_of_pr");
  return roles;
}

async function recipientFilter(req) {
  const permissions = await getEffectivePermissions(req);
  return { $or: [{ recipientId: req.session.userId }, { recipientRole: { $in: roleRecipients(permissions) } }] };
}

router.get("/", requirePermission("notifications.read"), async (req, res) => {
  try {
    const notifications = await req.models.Notifications.find(await recipientFilter(req))
      .sort({ createdAt: -1 })
      .populate("eventRequestId", "title eventName status")
      .lean();
    return sendSuccess(res, { notifications });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:id/read", requirePermission("notifications.read"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return sendError(res, 400, "Invalid notification ID");
  try {
    const notification = await req.models.Notifications.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.session.userId },
      { $set: { readAt: new Date() } },
      { new: true, runValidators: true },
    );
    if (!notification) return sendError(res, 404, "Notification not found");
    return sendSuccess(res, { notification });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/preferences", requirePermission("notifications.manage"), async (req, res) => {
  try {
    const preferences = await req.models.NotificationPreferences.findOne({ userId: req.session.userId }).lean();
    return sendSuccess(res, { preferences: preferences || { userId: req.session.userId, channel: "in_app", frequency: "immediate" } });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.put("/preferences", requirePermission("notifications.manage"), async (req, res) => {
  const { channel = "in_app", frequency = "immediate" } = req.body || {};
  if (!["in_app", "email"].includes(channel)) return sendError(res, 400, "channel must be in_app or email");
  if (!["immediate", "daily", "weekly"].includes(frequency)) return sendError(res, 400, "frequency must be immediate, daily, or weekly");
  try {
    const preferences = await req.models.NotificationPreferences.findOneAndUpdate(
      { userId: req.session.userId },
      { $set: { userId: req.session.userId, channel, frequency } },
      { new: true, upsert: true, runValidators: true },
    );
    return sendSuccess(res, { preferences });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

export default router;
