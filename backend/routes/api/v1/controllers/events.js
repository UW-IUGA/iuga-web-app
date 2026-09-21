/*
* Purpose: Manage calendar events and attendee RSVPs for IUGA activities.
* Authentication/Authorization Requirements: Public for viewing calendar events; logged-in session required to RSVP, withdraw, or view participant survey answers.
* Expected Request Information:
* - GET /: optional session to mark events the caller has RSVP'd to
* - GET /id/:eId: event ObjectId parameter
* - GET /upcoming: none
* - POST /rsvp: logged-in session and JSON body with event ObjectId `eId` and optional `rsvpAnswers`
* - DELETE /withdraw/:eId/:pId: logged-in session, event ObjectId `eId`, and participant ObjectId `pId`
* - GET /:pId: logged-in session and participant ObjectId `pId`
* Expected Response Information:
* - 200 with event data, upcoming event list, or participant details
* - 400 for malformed IDs, closed/past RSVPs, duplicate RSVPs, or invalid answer shapes
* - 401 when a protected endpoint is called without a session
* - 403 when a non-admin attempts to withdraw or inspect another user's RSVP
* - 404 when an event or participant record does not exist
* - 500 on unexpected database errors
*/

import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requireAuth, isOwnerOrAdmin } from "../utils/auth.js";

var router = express.Router();
/*
 * @behavior Validate that a value is a 24-character hexadecimal MongoDB ObjectId string.
 * @param value — the value to check
 * @returns true when the value is a valid 24-character hexadecimal ObjectId string, false otherwise
 */
function validId(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{24}$/i.test(value) &&
    mongoose.isValidObjectId(value)
  );
}

/*
 * @behavior Validate the structure and field limits of an array of RSVP question answers.
 * @param value — the raw RSVP answers array from the request body
 * @returns an error message string when validation fails, or null when valid
 */
function readRsvpAnswers(value) {
  if (!Array.isArray(value)) return "rsvpAnswers must be an array";

  for (const answer of value) {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
      return "Each RSVP answer must be an object";
    }
    if (
      typeof answer.qId !== "string" ||
      answer.qId.trim() === "" ||
      answer.qId.trim().length > 100
    ) {
      return "Each RSVP answer qId must be a non-empty string of 100 characters or fewer";
    }
    if (
      typeof answer.aString !== "string" ||
      answer.aString.length > 2000
    ) {
      return "Each RSVP answer aString must be a string of 2000 characters or fewer";
    }
  }

  return null;
}

//-------------------------------Event Endpoints----------------------------------------------

/*
 * @behavior Retrieve all calendar events, indicating whether the logged-in user has RSVP'd to each.
 *           Anyone may call this endpoint; authentication is optional.
 * @param req — the Express request, optionally holding an authenticated session
 * @param res — the Express response
 * @returns 200 with an array of event summary objects including hasRSVPd status; or 500 when database
 *          access fails
 */
router.get("/", async function (req, res) {
  try {
    if (req.session.isAuthenticated) {
      const events = await req.models.Events.find({})
        .populate("eParticipants")
        .exec();
      const userObjectId = new mongoose.Types.ObjectId(req.session.userId);

      const eventsData = await Promise.all(
        events.map(async (event) => {
          const hasRSVPd = event.eParticipants.some((participant) =>
            participant.pUID.equals(userObjectId),
          );
          return {
            eId: event._id,
            eName: event.eName,
            eStartDate: event.eStartDate,
            eEndDate: event.eEndDate,
            eLocation: event.eLocation,
            eOrganizers: event.eOrganizers,
            eDescription: event.eDescription,
            eLabels: event.eLabels,
            hasRSVPd: hasRSVPd,
          };
        }),
      );

      res.json(eventsData);
    } else {
      const events = await req.models.Events.find({});
      const eventsData = await Promise.all(
        events.map(async (event) => {
          return {
            eId: event._id,
            eName: event.eName,
            eStartDate: event.eStartDate,
            eEndDate: event.eEndDate,
            eLocation: event.eLocation,
            eOrganizers: event.eOrganizers,
            eDescription: event.eDescription,
            eLabels: event.eLabels,
            hasRSVPd: false,
          };
        }),
      );

      res.json(eventsData);
    }
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Retrieve detailed information for a single event by its identifier, including survey
 *           questions and the caller's answers if logged in. Anyone may call this endpoint.
 * @param req — the Express request containing the event id parameter eId and optional session
 * @param res — the Express response
 * @returns 200 with the event details; 400 when eId is not a valid identifier; 404 when no event
 *          matches; or 500 when database access fails
 */
router.get("/id/:eId", async function (req, res) {
  try {
    const eId = req.params.eId;
    if (!validId(eId)) {
      return sendError(res, 400, "Invalid event ID");
    }

    const event = await req.models.Events.findById(eId)
      .populate("eParticipants", "pUID")
      .exec();
    if (!event) {
      return sendError(res, 404, "Event not found");
    }

    let hasRSVPd = false;
    let rsvpAnswers = [];
    if (req.session.isAuthenticated) {
      const userObjectId = new mongoose.Types.ObjectId(req.session.userId);
      const participant = await req.models.Participants.findOne({
        pUID: userObjectId,
        eID: eId,
      }).exec();
      if (participant) {
        hasRSVPd = true;
        rsvpAnswers = participant.rsvpAnswers.map((answer) => ({
          qId: answer.qId,
          aString: answer.aString,
        }));
      }
    }

    const eventData = {
      eId: event._id,
      eName: event.eName,
      eOrganizers: event.eOrganizers,
      eStartDate: event.eStartDate,
      eEndDate: event.eEndDate,
      eLocation: event.eLocation,
      eDescription: event.eDescription,
      ePics: event.ePics,
      eLabels: event.eLabels,
      rsvpQuestions: event.rsvpQuestions,
      rsvpAnswers,
      participants: event.eShowParticipants ? event.eParticipants.length : null,
      showParticipants: event.eShowParticipants,
      eThumbnailPath: event.eThumbnailPath,
      rsvpEnabled: event.eRsvpEnabled,
      eAltLink: event.eAltLink,
      hasRSVPd,
    };

    return res.json(eventData);
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Retrieve up to three upcoming events for the homepage display, sorted by start date.
 *           Anyone may call this endpoint.
 * @param req — the Express request
 * @param res — the Express response
 * @returns 200 with an array of up to three event summaries; or 500 when database access fails
 */
router.get("/upcoming", async function (req, res) {
  try {
    const events = await req.models.Events.aggregate([
      {
        $project: {
          eId: "$_id",
          eName: 1,
          eOrganizers: 1,
          eDescription: 1,
          eLabels: 1,
          eStartDate: 1,
          eThumbnailPath: 1,
          _id: 0, // Exclude the original _id field
        },
      },
      {
        $sort: { eStartDate: -1 },
      },
      {
        $limit: 3,
      },
    ]);

    res.json(events);
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Register the signed-in user as an attendee for an event and save their survey answers.
 *           Only authenticated users may call this endpoint. 
 * @param req — the Express request containing the authenticated session, event id eId, and rsvpAnswers
 * @param res — the Express response
 * @returns 200 on success; 400 when the event id is malformed, answers are invalid, RSVP is disabled,
 *          the event has already started, or the user already RSVP'd; 401 when unauthenticated; 404
 *          when the event does not exist; or 500 when saving fails
 */
router.post("/rsvp", requireAuth, async function (req, res) {
  //Using the given event id and user id parameters, create a participant profile for the user and this pId into the event's participant list
  try {
    const { eId, rsvpAnswers } = req.body ?? {};
    if (!validId(eId)) {
      return sendError(res, 400, "Invalid event ID");
    }
    const rsvpError = readRsvpAnswers(rsvpAnswers);
    if (rsvpError) return sendError(res, 400, rsvpError);

    const event = await req.models.Events.findById(eId)
      .populate("eParticipants")
      .exec();
    const userObjectId = new mongoose.Types.ObjectId(req.session.userId);

    if (!event) {
      return sendError(res, 404, "Event not found");
    }

    // Check if RSVP is enabled for this event
    if (!event.eRsvpEnabled) {
      return sendError(res, 400, "RSVP is not enabled for this event");
    }

    // Check if today's date is past the start date
    const today = new Date();
    const eventStartDate = new Date(event.eStartDate);
    if (today > eventStartDate) {
      return sendError(res, 400, "The event has already started or passed.");
    }

    // Check if the user is already a participant
    const userIsParticipant = event.eParticipants.some((participant) =>
      participant.pUID.equals(userObjectId),
    );
    if (userIsParticipant) {
      return sendError(res, 400, "You already RSVPd!");
    }

    const newParticipant = new req.models.Participants({
      pUID: userObjectId,
      eID: eId,
      rsvpAnswers,
    });

    const savedParticipant = await newParticipant.save();

    event.eParticipants.push(savedParticipant);

    await event.save();

    return sendSuccess(res, { message: "RSVP successful!" });
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Remove a participant's RSVP from an event. Only the participant themselves or an
 *           administrator may call this endpoint.
 * @param req — the Express request containing the session, event id eId, and participant id pId
 * @param res — the Express response
 * @returns 200 on successful withdrawal; 400 when eId or pId is malformed; 401 when unauthenticated;
 *          403 when the caller is neither the participant nor an admin; 404 when the event or
 *          participant record is not found; or 500 when saving fails
 */
router.delete("/withdraw/:eId/:pId", requireAuth, async function (req, res) {
  try {
    const pId = req.params.pId;
    const eId = req.params.eId;
    if (!validId(eId)) {
      return sendError(res, 400, "Invalid event ID");
    }
    if (!validId(pId)) {
      return sendError(res, 400, "Invalid participant ID");
    }

    const event = await req.models.Events.findById(eId);
    if (!event) {
      return sendError(res, 404, "Event not found");
    }

    const participant = await req.models.Participants.findById(pId);
    if (!participant || participant.eID?.toString() !== eId) {
      return sendError(res, 404, "Participant not found");
    }

    if (!isOwnerOrAdmin(req, participant.pUID)) {
      return sendError(
        res,
        403,
        "You are not authorized to withdraw this participant",
      );
    }

    event.eParticipants = event.eParticipants.filter(
      (participant) => participant.toString() !== pId,
    );
    await event.save();

    return sendSuccess(res);
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

/*
 * @behavior Retrieve a participant's event survey answers and registration details. Only the
 *           participant themselves or an administrator may call this endpoint.
 * @param req — the Express request containing the authenticated session and participant id pId
 * @param res — the Express response
 * @returns 200 with participant details; 400 when pId is malformed; 401 when unauthenticated;
 *          403 when the caller is neither the participant nor an admin; 404 when the participant
 *          is not found; or 500 when database access fails
 */
router.get("/:pId", requireAuth, async function (req, res) {
  try {
    const pId = req.params.pId;
    if (!validId(pId)) {
      return sendError(res, 400, "Invalid participant ID");
    }

    const participant = await req.models.Participants.findById(pId);
    if (!participant) {
      return sendError(res, 404, "Participant not found.");
    }

    if (!isOwnerOrAdmin(req, participant.pUID)) {
      return sendError(
        res,
        403,
        "You are not authorized to view this participant",
      );
    }

    const participantData = {
      id: pId,
      userId: participant.pUID,
      aList: participant.aList,
      isAnon: participant.isAnon,
    };
    return sendSuccess(res, { participant: participantData });
  } catch (error) {
    console.log(error);
    return sendError(res, 500);
  }
});

export default router;
