import express from "express";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requirePermission } from "../utils/auth.js";

const router = express.Router();

router.get("/", requirePermission("charter.read"), async (req, res) => {
  try {
    const sections = await req.models.CharterDocuments.find().sort({ category: 1, title: 1 }).lean();
    return sendSuccess(res, { sections });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.get("/:sectionKey", requirePermission("charter.read"), async (req, res) => {
  try {
    const section = await req.models.CharterDocuments.findOne({ sectionKey: req.params.sectionKey }).lean();
    if (!section) return sendError(res, 404, "Charter section not found");
    return sendSuccess(res, { section });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

router.patch("/:sectionKey", requirePermission("charter.manage"), async (req, res) => {
  if (typeof req.body?.content !== "string" || req.body.content.trim() === "") {
    return sendError(res, 400, "content is required");
  }

  try {
    const section = await req.models.CharterDocuments.findOne({ sectionKey: req.params.sectionKey });
    if (!section) return sendError(res, 404, "Charter section not found");
    section.revisions = [...(section.revisions || []), {
      content: section.content,
      authorId: req.session.userId,
      createdAt: new Date(),
    }];
    section.content = req.body.content.trim();
    section.updatedBy = req.session.userId;
    if (typeof req.body.title === "string" && req.body.title.trim()) section.title = req.body.title.trim();
    await section.save();
    return sendSuccess(res, { section });
  } catch (error) {
    console.error(error);
    return sendError(res, 500);
  }
});

export default router;
