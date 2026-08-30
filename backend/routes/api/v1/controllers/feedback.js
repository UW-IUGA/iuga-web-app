/*
Refer to the "IUGA Website Backend Doc" for more information.

Schema addressed in feedback.js:
- Feedback
*/

import express from "express";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requireAuth, requireAdmin } from "../utils/auth.js";
import mongoose from "mongoose";

var router = express.Router();
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
Purpose: Retrieve a feedback form's info from the database

Needed Info:
- is a feedback form id the only thing queried?

Assumed req variables (Will need to check back with frontend for what is sent in):
- "fID", this is the feedback form ID requested from the database.
*/
router.get("/", requireAuth, async (req, res) => {
  try {
    const fID = req.query.fID;
    if (!fID || !mongoose.isValidObjectId(fID)) {
      return sendError(res, 400, "Invalid feedback ID");
    }
    //Find the requested feedbackform based on the given req data.
    const rawForm = await req.models.Feedback.findById(fID);
    if (!rawForm) {
      return sendError(res, 404, "Feedback not found");
    }

    //Package up all the data from the feedback form
    const feedbackForm = {
      fId: rawForm._id,
      fUID: rawForm.fUID,
      fType: rawForm.fType,
      fTopic: rawForm.fTopic,
      fDescription: rawForm.fDescription,
    };

    //Send the data back in one json object.
    res.json(feedbackForm);
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

/*
Purpose: Save a new feedback form to the database

Needed Info:
- What other kinds of questions are we asking besides these ones?
- Will the req variablesbe like this?

Assumed req variables (Will need to check back with frontend for what is sent in):
- fUID
- fType
- fTopic
- fDescription
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
Purpose: Delete a feedback form from the database

Needed info:
- What fields should be a factor in what is deleted, besides the feedback id?
- Do we want to delete multiple at a time or just one at a time?

Assumed req variables (Will need to check back with frontend for what is sent in):
- fID
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

