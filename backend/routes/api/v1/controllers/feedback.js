/*
Refer to the "IUGA Website Backend Doc" for more information.

Schema addressed in feedback.js:
- Feedback
*/

import express from 'express';

var router = express.Router();

/*
Purpose: Retrieve a feedback form's info from the database

Needed Info:
- is a feedback form id the only thing queried?

Assumed req variables (Will need to check back with frontend for what is sent in):
- "fID", this is the feedback form ID requested from the database.
*/
router.get('/', async (req,res) => {
    try {
        //Find the requested feedbackform based on the given req data.
        const rawForm = await req.models.Feedback.findById(req.query.fID);

        //Package up all the data from the feedback form
        const feedbackForm = {
            fId: rawForm._id,
            fUID: rawForm.fUID,
            fType: rawForm.fType,
            fTopic: rawForm.fTopic,
            fDescription: rawForm.fDescription
        } //The keys are what the client use to access the accompanying value.

        //Send the data back in one json object.
        res.json(feedbackForm)

    } catch(error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }

})

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
router.post('/', async (req,res) => {
    try {
        //Fit the new feedback data into a new Feedback Schema Object
        const newFeedback = new req.models.Feedback({
            fUID: req.body.fUID,
            fType: req.body.fType,
            fTopic: req.body.fTopic,
            fDescription: req.body.fDescription
        })
        
        //Save the new Feedback object into the database.
        await newFeedback.save();

        //Give the client a proper reply saying it went well.
        res.json({status:"success"});

    } catch(error) {
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
})

/*
Purpose: Delete a feedback form from the database

Needed info: 
- What fields should be a factor in what is deleted, besides the feedback id?
- Do we want to delete multiple at a time or just one at a time?

Assumed req variables (Will need to check back with frontend for what is sent in):
- fID
*/
router.delete('/', async (req,res) => {
    try{
        //Delete the given feedback form        
        await req.models.Feedback.deleteOne({ _id:fID});
        
        //Tell the client it worked
        res.json({status:"success"})

    } catch(error){
        console.log(error);
        res.status(500).json({status:"error", message:error.message});
    }
})

export default router