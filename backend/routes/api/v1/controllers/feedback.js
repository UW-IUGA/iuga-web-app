/*
Purpose: Serve the feedback form: read one form, save a new one, and let an administrator delete one.
Authentication/Authorization Requirements: Reading and saving need a signed-in user; deleting needs
an administrator.
Expected Request Information:
- GET /?fID=<id> — the form to read
- POST / with fType, fTopic, and fDescription
- DELETE /?fID=<id> — the form to remove
Expected Response Information:
- GET: the form's fields; 400 for an unusable id, 404 when there is no such form
- POST: 200 once saved; 400 when a field is missing, empty, or over its length limit
- DELETE: 200 once removed; 400 for an unusable id
*/

import express from "express";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requireAuth, requireAdmin } from "../utils/auth.js";
import mongoose from "mongoose";

var router = express.Router();
/*
 * @behavior Read and check the fields of a submitted feedback form, trimming surrounding spaces.
 * @param body — the request body as it arrived
 * @returns { fields } with the trimmed type, topic, and description when every field is usable, or
 *          { error } holding a message for the client when one is not
 */
function readFeedbackFields(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Feedback body must be an object" };
  }

  const fType = body.fType === undefined ? "General" : body.fType;
  if (typeof fType !== "string" || fType.trim().length > 100) {
    return { error: "fType must be a string of 100 characters or fewer" };
  }
  if (typeof body.fTopic !== "string" || body.fTopic.trim() === "") {
    return { error: "fTopic must be a non-empty string" };
  }
  if (body.fTopic.trim().length > 200) {
    return { error: "fTopic must be 200 characters or fewer" };
  }
  if (
    typeof body.fDescription !== "string" ||
    body.fDescription.trim() === ""
  ) {
    return { error: "fDescription must be a non-empty string" };
  }
  if (body.fDescription.trim().length > 5000) {
    return { error: "fDescription must be 5000 characters or fewer" };
  }

  return {
    fields: {
      fType: fType.trim() || "General",
      fTopic: body.fTopic.trim(),
      fDescription: body.fDescription.trim(),
    },
  };
}

/*
 * @behavior Read one feedback form by id.
 * @param req — the Express request; req.query.fID names the form to read
 * @param res — the Express response
 * @returns nothing; answers 200 with the form's fields, 400 for an id that is not a valid id, 404
 *          when there is no such form, or 500 when the lookup fails
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const fID = req.query.fID;
    if (!fID || !mongoose.isValidObjectId(fID)) {
      return sendError(res, 400, "Invalid feedback ID");
    }
    const rawForm = await req.models.Feedback.findById(fID);
    if (!rawForm) {
      return sendError(res, 404, "Feedback not found");
    }

    const feedbackForm = {
      fId: rawForm._id,
      fUID: rawForm.fUID,
      fType: rawForm.fType,
      fTopic: rawForm.fTopic,
      fDescription: rawForm.fDescription,
    };

    res.json(feedbackForm);
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Save a new feedback form for the signed-in user.
 * @param req — the Express request; the body carries fType, fTopic, and fDescription
 * @param res — the Express response
 * @returns nothing; answers 200 once saved, 400 when a field is unusable, or 500 when the save fails
 */
router.post("/", requireAuth, async (req, res) => {
  const { fields, error } = readFeedbackFields(req.body);
  if (error) return sendError(res, 400, error);

  try {
    const newFeedback = new req.models.Feedback({
      fUID: req.session.userId,
      ...fields,
    });

    await newFeedback.save();

    return sendSuccess(res);
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Delete one feedback form. Only an administrator reaches this handler.
 * @param req — the Express request; req.query.fID names the form to remove
 * @param res — the Express response
 * @returns nothing; answers 200 once removed, 400 for an id that is not a valid id, or 500 when the
 *          delete fails
 */
router.delete("/", requireAdmin, async (req, res) => {
  const fID = req.query.fID;
  if (
    typeof fID !== "string" ||
    !/^[0-9a-f]{24}$/i.test(fID) ||
    !mongoose.isValidObjectId(fID)
  ) {
    return sendError(res, 400, "Invalid feedback ID");
  }

  try {
    await req.models.Feedback.deleteOne({ _id: fID });
    return sendSuccess(res);
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

export default router;

