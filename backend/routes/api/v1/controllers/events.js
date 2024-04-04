/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in events.js:
- Events
- Participants
*/

import express from 'express';
import { models } from '../../../../models';

var router = express.Router();
//-------------------------------Event Endpoints----------------------------------------------
router.get("/", async function(req, res) {
    try{
        //First check to see if any queries were passed in to filter with.
        const query = {};
        if(req.query.month) {
            query.month = req.query.month;
        }
        if(req.query.year) {
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
                            $eq: [{ $month: 'eStartDate'}, query.month]
                        }
        } else if (query.month != undefined) {
            exprExpression = {
                $eq: [{ $month: 'eStartDate'}, query.year]
            }
        } else {
            //What should the default return of the docs be? All of the docs? Or only the docs in the current month?
            filter = false;
        }
        
        //Once filter type selected for the specific query or queries, find the docs that match the filter.
        let events;
        if (filter) { 
            events = await models.Events.aggregate([
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
            events = await models.Events.find({})
        }

        //Package the data in a variable and send back to client.    
        //Default returned info for events: title, start/end date, location
        const eventsData = await Promise.all(
            events.map(async event => {
            return {
                id:event._id,
                name:event.eName,
                startDate:event.eStartDate,
                endDate:event.eEndDate,
                location:event.eLocation,
            };
            })
        );

        res.json(eventsData);
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
});

router.get("/:eId", async function(req,res) {
    //When getting an event based on an id, get all info about the event asked for
    try {
        const eId = req.params.eId
        const event = await models.Events.findById({eId})

        const eventData = {
            id:event._id,
            name:event.eName,
            organizers:event.eOrganizers,
            startDate:event.eStartDate,
            endDate:event.eEndDate,
            location:event.eLocation,
            description:event.eDescription,
            pictures:event.ePics,
            labels:event.eLabels,
            questions:event.qList,
            participants:event.participants
        };

        res.json(eventData);
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
})

router.post("/", async function(req, res) {
    if(req.session.isAuthenticated && req.session.isAdmin) {
        //Can make new events because they are admin
    } else
    {
        //error handling
    }
    
    res.send("events");
});

//router.delete will just filter by id and delete the found docs of events
router.delete("/:eId", async function(req,res) {
    try {
        const eId = req.params.eId;
        const event = await models.Events.findByIdAndDelete({eId});

        res.json({event:event, status:"Success"});
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
})

//User signs up as a participant (Make a new particpant schema and assign the user as one.)
//maybe change pId param to uId, so that we can also have this section create the participant account as the first thing done.
router.post("/addParticipant", async function(req,res) { 
    //Using the given event id parameter, add the participant into the event's participant list
    try {
        const pId = req.pId;
        const eId = req.eId;
        const event = await models.Events.findById({eId});

        event.participants.push(pId);
        await event.save();

        res.json({status:"Success"});
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
})

//User withdraws from an event
router.delete("/removeParticipant", async function(req,res) {
    //Using the given participant id parameter, remove the participant from the event's participant list
    try {
        const pId = req.pId;
        const eId = req.eId;
        const event = await models.Events.findById({eId});
        
        let newParticipants = [] 
        event.participants.forEach(participant => { 
            if(participant != pId) { 
                newParticipants.push(participant); 
            }
        });

        event.participants = newParticipants;
        await event.save();

        res.json({status:"Success"});
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
})

router.get("/getParticipant", async function(req,res) {

})
//-------------------------------Participant Endpoints----------------------------------------------

//User answers RSVP questions, update answer list


//

export default router;