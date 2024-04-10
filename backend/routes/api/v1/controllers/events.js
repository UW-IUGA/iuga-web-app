/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in events.js:
- Events
- Participants
*/

import express from 'express';

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
        
        //Do a double check for bad month/year queries passed in by the user.

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
            //Just display no events is another option
        }

        //Package the data in a variable and send back to client.    
        //Default returned info for events: title, start/end date, location
        const eventsData = await Promise.all(
            events.map(async event => {
            return {
                //Assume that this endpoint is for retrieving events from the calendar when the user loads the page or flips teh calendar.
                id:event._id,
                name:event.eName,
                startDate:event.eStartDate,
                endDate:event.eEndDate,
                location:event.eLocation
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
        const event = await req.models.Events.findById({eId})

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
        //Check if admin before deletion?
        const eId = req.params.eId;
        const event = await req.models.Events.findByIdAndDelete({eId});

        res.json({event:event, status:"Success"});
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
})

//User signs up as a participant (Make a new particpant schema and assign the user as one.)
router.post("/RSVP", async function(req,res) { 
    //Using the given event id and user id parameters, create a participant profile for the user and this pId into the event's participant list
    try {
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
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
})

//User withdraws from an event
router.delete("/withdraw", async function(req,res) {
    //Using the given participant id parameter, remove the participant from the event's participant list
    try {
        const pId = req.body.pId;
        const eId = req.body.eId;
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
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
})

router.get("/getParticipant", async function(req,res) {
//This is specfically for a list of participants from the admins point of view, so when you 
//frontend needs to do the admin check.

//Based on the list of pIds retreived, find the participant docs in the db, and return a list of their names to the client.

})

//Given a participant's id, pull their answer list, user profile, and other info about them
router.get("/:pId", async function(req, res) {

})



//-------------------------------Participant Endpoints----------------------------------------------
//User answers RSVP questions, update answer list


//

export default router;