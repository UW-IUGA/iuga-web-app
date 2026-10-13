/*
Purpose: Report whether a committee recruitment campaign is currently open so
         the Get Involved page can offer the application form or fall back to
         direct contact.

Authentication/Authorization Requirements: None. Recruitment status is public.

Expected Request Information:
- Parameters: none.
- Queries: none.
- Body: none.

Expected Response Information:
- 200 { status: "success", application: { isOpen: true, formUrl, closesAt } }
      when an open campaign exists.
- 200 { status: "success", application: { isOpen: false } } when the campaign
      is closed or missing.
- 500 { status: "error", message: "There was an error on our side :(" } when
      the lookup fails.
*/

import express from "express";
import { CREATIVE_COMMITTEE } from "../../../../committeeRecruitment.js";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";

const router = express.Router();

/*
Purpose: Read the Creative Committee application status.
Authentication/Authorization Requirements: None (public).
*/
router.get("/creative", async (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
        const application = await req.models.CommitteeRecruitment.findOne({
            committee: CREATIVE_COMMITTEE,
            closesAt: { $gt: new Date() },
        })
            .lean()
            .exec();

        if (!application) {
            return sendSuccess(res, { application: { isOpen: false } });
        }

        return sendSuccess(res, {
            application: {
                isOpen: true,
                formUrl: application.formUrl,
                closesAt: application.closesAt,
            },
        });
    } catch (error) {
        console.error("Could not read Creative Committee application status:", error);
        return sendError(res, 500);
    }
});

export default router;
