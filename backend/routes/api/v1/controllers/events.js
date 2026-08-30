/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in events.js:
- Events
- Participants
*/

import express from "express";
import mongoose from "mongoose";
import { sendError } from "../helpers/sendError.js";
import { sendSuccess } from "../helpers/sendSuccess.js";
import { requireAuth, isOwnerOrAdmin } from "../utils/auth.js";

var router = express.Router();
function validId(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{24}$/i.test(value) &&
    mongoose.isValidObjectId(value)
  );
}

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
Purpose: Get information for events to display on the calendar for a given month/year.
Authentication/Authorization Requirements: None

Expected Request Information (<r> indicates a required field to include in the call):
- Parameters: N/A
- Queries: ?year=####&month=##
- Body: N/A

Expected Response Information:
- return [{
            eId: event id,
            eName: String event name,
            eStartDate: Date event starts,
            eEndDate: Date event ends,
            eLocation: String event location,
            eOrganizers: String event organizer(s),
            eDescription: String event description,
            eLabels: Array of String event category label(s)
        }]
*/
router.get("/", async function (req, res) {
  try {
    if (req.session.isAuthenticated) {
      const events = await req.models.Events.find({})
        .populate("eParticipants")
        .exec();
      const userObjectId = mongoose.Types.ObjectId(req.session.userId);

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
Purpose: Selecting a specific event on the calendar
Authentication/Authorization Requirements: None

Expected Request Information (<r> indicates a required field to include in the call):
- Parameters: <r> eId
- Queries: N/A
- Body: N/A

Expected Response Information:
- return [{
            eId: event id,
            eName: String event name,
            eStartDate: Date event starts,
            eEndDate: Date event ends,
            eLocation: String event location,
            eOrganizers: Array of String event organizer(s),
            eDescription: String event description,
            eLabels: Array of String event category label(s),
            ePics: Array of Image event pics,
            qList: Array of key:value pairs representing RSVP question number and question string,
            participants: Array of participant ids,
            eThumbnail: a Image of event
        }]
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
      const userObjectId = mongoose.Types.ObjectId(req.session.userId);
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
Purpose: For the homepage's 3 displayed latest events
Authentication/Authorization Requirements: None

Expected Request Information (<r> indicates a required field to include in the call):
- Parameters: N/A
- Queries: N/A
- Body: N/A

Expected Response Information:
- return [{
            eId: event id,
            eName: String event name,
            eStartDate: Date event starts,
            eEndDate: Date event ends,
            eOrganizers: Array of String event organizer(s),
            eDescription: String event description,
            eLabels: Array of String event category label(s),
            eThumbnail: a Image of event
        }]
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
Purpose: User signs up as a participant to an event
Authentication/Authorization Requirements: Logged in

Expected Request Information (<r> indicates a required field to include in the call):
- Parameters: N/A
- Queries: N/A
- Body: {
            <r> uId: Current user's id to add them to event,
            <r> eId: find the event,
            aList: Array of key:value pairs with question number and answer string,
            isAnon: Boolean if user is participating anon or not
        }

Expected Response Information:
- {
    status: "success"
  }
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
    const userObjectId = mongoose.Types.ObjectId(req.session.userId);

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
Purpose: User withdraws from an event
Authentication/Authorization Requirements: Logged in, (optional) is admin

Expected Request Information (<r> indicates a required field to include in the call):
- Parameters: eId, pId
- Queries: N/A
- Body: N/A

Expected Response Information:
- {
    status: "success"
  }
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

//Given a participant's id, pull their answer list, user profile, and other info about them
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
