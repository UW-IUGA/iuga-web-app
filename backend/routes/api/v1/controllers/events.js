/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in events.js:
- Events
- Participants
*/

import express, { raw } from 'express';

var router = express.Router();
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
router.get("/", async function(req, res) {
    try {
        //First check to see if any queries were passed in to filter with, and check for bad values.
        const query = {};
        if(req.query.month) {
            query.month = req.query.month;
        }

        if(req.query.year && req.query.year <= new Date().getFullYear()) {
            query.year = req.query.year;
        }
        
        //Find the correct staging operators based on the query filters available.
        let filter = true;
        let exprExpression = {}
        if (query.year != undefined && query.month != undefined) {
            exprExpression = {
                $and: [
                    { $eq: [{ $month: '$eStartDate' }, query.month] },
                    { $eq: [{ $year: '$eStartDate' }, query.year] }
                ]
            } 
        } else if (query.year != undefined) {
            exprExpression = {
                            $eq: [{ $year: 'eStartDate'}, query.year]
                        }
        } else if (query.month != undefined) {
            exprExpression = {
                $eq: [{ $month: 'eStartDate'}, query.month]
            }
        } else {
            //What should the default return of the docs be? All of the docs? Or only the docs in the current month?
            filter = false;
            //Just display no events is another option
        }
        
        //Once filter type selected for the specific query or queries, find the docs that match the filter.
        let events;
        if (filter) { 
            events = await req.models.Events.aggregate([
                {
                    //Match finds the specified docs
                    $match: { 
                        //Expr allows for the use of a complex comparison inside the match stage
                        //exprExpression will handle actually identifying the docs based on requested month and or year
                        $expr: exprExpression 
                    }
                }
            ]);
        } else {
            events = await req.models.Events.find({})
            //Just displaying no events is another option
        }

        //Package the data in a variable and send back to client.    
        const eventsData = await Promise.all(
            events.map(async event => {
                return {
                    //Assume that this endpoint is for retrieving events from the calendar when the user loads the page or flips the calendar.
                    eId:event._id,
                    eName:event.eName,
                    eStartDate:event.eStartDate,
                    eEndDate:event.eEndDate,
                    eLocation:event.eLocation,
                    eOrganizers: event.eOrganizers,
                    eDescription: event.eDescription,
                    eLabels: event.eLabels
                };
            })
        );

        res.json(eventsData);
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message: "There was an error on our side :("});
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
router.get("/id/:eId", async function(req,res) {
    //When getting an event based on an id, get all info about the event asked for
    try {
        const eId = req.params.eId;
        const regex = new RegExp("[0-9A-Fa-f]{24}");
        if (regex.test(eId)) {
            req.models.Events.findById(eId, function(err, event) {
                if (err) {
                    console.error(err);
                    res.status(400);
                } else if (event == null) {
                    res.status(400).json({status:"error", message: "Bad request..."});;
                } else {
                    const eventData = {
                        eId:event._id,
                        eName:event.eName,
                        eOrganizers:event.eOrganizers,
                        eStartDate:event.eStartDate,
                        eEndDate:event.eEndDate,
                        eLocation:event.eLocation,
                        eDescription:event.eDescription,
                        ePics:event.ePics,
                        eLabels:event.eLabels,
                        qList:event.qList,
                        participants:event.participants,
                        eThumbnail: event.eThumbnail,
                        rsvp: event.rsvp,
                        eAltLink: event.eAltLink
                    };
            
                    res.json(eventData);
                }
            });
        } else {
            console.error(`/events/id/${eId} Failed regex test!`);
            res.status(400).json({status:"error", message: "Bad request..."});
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message: "Sorry something bad happened :("});
    }
})

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
router.get("/upcoming", async function(req, res) {
    try {
        //sort the result by descending
        const events = await req.models.Events.find(
            {}, 
            ["eName", "eOrganizers", "eDescription", "eLabels", "eStartDate", "eThumbnail"]
        ).sort({"eStartDate":-1}).limit(3); 
        res.json(events);
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message: "Sorry! Something happened on our side :("});    
    }
})


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
    status:"Success"
  }
*/
router.post("/RSVP", async function(req,res) { 
    //Using the given event id and user id parameters, create a participant profile for the user and this pId into the event's participant list
    try {
        if(req.session.isAuthenticated) {
            const uId = req.body.uId;
            const eId = req.body.eId;
            const event = await req.models.Events.findById({eId});

            //Loop through the event participants, and check if they are already a participant
                //Another option instead of this check, is to make a separate endpoint to update the participant, given event id and user id.
            let isParticipant = false;
            let pId;
            event.participants.forEach(p => {
                if(req.models.Participants.findById({p}).pUID == uId) {
                    isParticipant = true;
                    pId = p; //also grab their pId
                }
            });
            
            //If the user is already a participant, check to see what was sent in, update the values for the participant accordingly.
            if(isParticipant==true) {
                const participant = await req.models.Participants.findById({pId});
                participant.aList = req.body.aList;
                participant.isAnon = req.body.isAnon;

                await participant.save();
            } else { 
                //Else make them a new participant, and save their info to the database and event participant list.
                //Fit the new participant data into a new Participant Schema Object
                const newParticipant = new req.models.Participants({
                    pUID: uId,
                    aList: req.body.aList,
                    isAnon: req.body.isAnon
                })

                //Save the new Participant object into the database.
                await newParticipant.save(); //doublecheck to see if this means we can still use the newParticipant doc now.
                event.participants.push(newParticipant._id);
                await event.save();
            }

            res.json({status:"Success"});
        } else {
            res.status(400).json({
                status: "error",
                error: "User is not logged in"
            })
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message: "Something bad happened :("});
    }
})


/*
Purpose: User withdraws from an event
Authentication/Authorization Requirements: Logged in, (optional) is admin

Expected Request Information (<r> indicates a required field to include in the call):
- Parameters: eId, pId
- Queries: N/A
- Body: N/A

Expected Response Information:
- {
    status:"Success"
  }
*/
router.delete("/withdraw/:eId/:pId", async function(req,res) {
    try {
        if(req.session.isAuthenticated) {
            const pId = req.params.pId;
            const eId = req.params.eId;
            const event = await req.models.Events.findById({eId});
            
            let newParticipants = [] 
            event.participants.forEach(participant => { 
                if(participant != pId) { 
                    newParticipants.push(participant); 
                }
            });

            event.participants = newParticipants;
            await event.save();

            res.json({status:"Success"});
        } else {
            res.status(400).json({
                status: "error",
                error: "User is not logged in"
            })        
        } 
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", error: "Something bad happened :("});
    }
})

//Given a participant's id, pull their answer list, user profile, and other info about them
router.get("/:pId", async function(req, res) {
    try {
        const pId = req.params.pId;
        const participant = await req.models.Participants.findById({pId});
        if (!participant) {
            return res.status(404).json({status:"error", message:"Participant not found."});
        }
        const participantData = {
            id: pId,
            userId: participant.pUID,
            aList: participant.aList,
            isAnon: participant.isAnon
        }
        // fix this
        res.json({status:"Success", participant: participantData});
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message: "Sorry something bad happened :("});
    }
})

export default router;