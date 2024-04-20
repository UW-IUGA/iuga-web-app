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
    try{
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
        res.status(500).json({status:"error", message:error.message});
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
router.get("/:eId", async function(req,res) {
    //When getting an event based on an id, get all info about the event asked for
    try {
        const eId = req.params.eId
        const event = await req.models.Events.findById({eId})

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
            eThumbnail: event.eThumbnail
        };

        res.json(eventData);
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
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
router.get("/upcoming", async function(req,res) {
    try {
        //sort the result by descending
        const rawEvents = await req.models.Events.find({}).sort({"eStartDate":-1}); 
        
        //get the 3 latest events
        let events = [rawEvents[0], rawEvents[1], rawEvents[2]]; 

        //package them
        const eventsData = await Promise.all( 
            events.map(async event => {
                return {
                    eId:event._id,
                    eName:event.eName,
                    eOrganizers:event.eOrganizers,
                    eDescription:event.eDescription,
                    eLabels:event.eLabels,
                    eThumbnail: event.eThumbnail,
                    eStartDate: event.eStartDate,
                    eEndDate: event.eEndDate
                }
            })
        )

        res.json(eventsData) //send the 3 events back
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});    
    }
})

/*
Purpose: Make a new event, or edit a preexisting one.
Authentication/Authorization Requirements: Logged in, and an admin user.

Expected Request Information (<r> indicates a required field to include in the call):
- Parameters: N/A
- Queries: N/A
- Body: { 
            <r> uId: Current user's id,
            eId: if editting an event provide the event id,
            <r> eName: String event name,
            <r> eOrganizers: String event organizer(s),
            <r> eStartDate: Date event starting date/time,
            eEndDate: Date event ending date/time,
            <r> eLocation: String event location,
            <r> eDescription: String event description,
            ePics: Array of Images of the event,
            eThumbnail: Image thumbnail of the event,
            eLabels: Array of String categorey/categories the event falls under,
            <r> qList: Array List of String RSVP questions,
            participants: Array List of participant ids, 
        }

Expected Response Information:
- {status:"Sucess"}
*/
router.post("/", req.upload.fields([{ name: 'ePics', maxCount: 10 }, { name: 'eThumbnail', maxCount: 1 }]), async function(req, res) {
    try{
        const uId = req.body.uID; //Other ways to get this would be to call req.session.id if that is available.
        const user = await req.models.Users.findById({uId})

        if(req.session.isAuthenticated && user.uType === "Admin") {
            //if an event id was given, then update the event with the given information instead
            if(req.body.eId) { 
                const eId = req.body.eId; 
                const event = await req.models.Events.findById({eId});
                
                //Update required body information
                event.eName = req.body.eName; 
                event.eOrganizers = req.body.eOrganizers;
                event.eStartDate  = req.body.eStartDate;
                event.eLocation = req.body.eLocation; 
                event.eDescription = req.body.eDescription;
                event.qList = req.body.qList;

                //Check if the optional body info is here too, if so then update the event.
                if(req.body.eLabels) {
                    event.eLabels = req.body.eLabels; 
                }
                if(req.body.eEndDate) {
                    event.eEndDate = req.body.eEndDate; 
                }
                if(req.body.participants) {
                    event.participants = req.body.participants; 
                }

                //Check if there were any images uploaded for the event thumbnail and pictures
                if (req.files) { 
                    //If so then populate the event with the givens.
                    if (req.files['ePics']) {
                        event.ePics = req.files['ePics'].map(file => file.path);
                    }
                    if (req.files['eThumbnail']) {
                        event.eThumbnail = req.files['eThumbnail'][0].path;
                    }
                }

                await event.save();
                res.json({status:"Success"});
            } else { //Otherwise create a new event as intended. (Similar process more or less)
                const event = new req.models.Events({
                    eName: req.body.eName, 
                    eOrganizers: req.body.eOrganizers,
                    eStartDate: req.body.eStartDate,
                    eLocation: req.body.eLocation,
                    eDescription: req.body.eDescription,
                    qList: req.body.qList
                })

                if(req.body.eLabels) {
                    event.eLabels = req.body.eLabels; 
                }
                if(req.body.eEndDate) {
                    event.eEndDate = req.body.eEndDate; 
                }
                if(req.body.participants) {
                    event.participants = req.body.participants; 
                }

                if (req.files) { 
                    //If so then populate the event with the givens.
                    if (req.files['ePics']) {
                        event.ePics = req.files['ePics'].map(file => file.path);
                    }
                    if (req.files['eThumbnail']) {
                        event.eThumbnail = req.files['eThumbnail'][0].path;
                    }
                }

                await event.save();
                res.json({status:"Success"})
            }
        } else {
            res.status(400).json({
                status: "error",
                error: "Access denied"
            })
        }
    } catch (error) {
        console.log(error);
        res.status(400).json({status:"error", message:error.message})
    }
});

/*
Purpose: Delete a specific event.
Authentication/Authorization Requirements: Logged in, and an admin user.

Expected Request Information (<r> indicates a required field to include in the call):
- Parameters: <r> eId
- Queries: N/A
- Body: N/A

Expected Response Information:
- {
    event:event, 
    status:"Success"
  }
*/
router.delete("/:eId", async function(req,res) {
    try {
        if(req.session.isAuthenticated) {
            const uId = req.params.uId;
            const currId = req.session.id;
            const currUser = await req.models.Users.findById({currId})

            if(currUser.uType ==="Admin"){    
                const eId = req.params.eId;
                const event = await req.models.Events.findByIdAndDelete({eId});

                res.json({event:event, status:"Success"});
            } else {
                res.json({status:"error", message:"Access denied."})
            }
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
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
        res.status(500).json({status:"error", message:error.message});
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
        res.status(500).json({status:"error", message:error.message});
    }
})


router.get("/getParticipant/:eId", async function(req,res) {
//This is specfically for a list of participants from the admins point of view, so when you 
//frontend needs to do the admin check.

//Based on the list of pIds retreived, find the participant docs in the db, and return a list of their names to the client.
    try {
        const currUser = await req.models.Users.findById({/*getID*/})
        if(req.session.isAuthenticated) {
            if(currUser.uType === "Admin") {
                const eID = req.params.eId;
                const event = await req.models.Events.findById({eID});
                if (!event) {
                    return res.status(404).json({status:"error", message:"Event not found."});
                }
                let participantNames = [];
                let participant;
                let userID;
                let users;
                let userFirstName;
                let userLastName;
                event.participants.forEach(async p => {
                    participant = await req.models.Participants.findById({p})
                    userID = participant.pUID
                    users = await req.models.Users.findById({userID});
                    userFirstName = users.uFirstName;
                    userLastName = users.uLastName;
                    participantNames.push({uFirstName: userFirstName, uLastName: userLastName});
                });
                res.json({status: "Success", participants: participantNames});
            } else {
                res.json({status:"error", message:"Access denied."})
            }
        } else {
            res.status(400).json({
                status: "error",
                error: "User is not logged in"
            })
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
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
        res.status(500).json({status:"error", message:error.message});
    }
})

export default router;