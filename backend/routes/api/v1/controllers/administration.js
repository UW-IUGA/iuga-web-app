/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in administration.js:
- Officers
- Committees
- Organizations
*/

import express from 'express';

var router = express.Router();

//-------------------------------Endpoints for officer related information--------------------------------

/*
Purpose: Save a new or update an existing officer in the DB, 

Needed Info:
- 

Assumed req variables (Will need to check with frontend for what is sent in):
- 
*/
router.post("/officers", function(req, res) { 
  //Find preexisting officer doc from DB. 
  //If officer exists, update the field related, 
  //Else make a new officer doc and post the info to DB.
  res.send("placeholder content");
});

/*
Purpose: Retrieve an officer from the DB

Needed Info:
- What other ways can the officer be queried for besides by id?

Assumed req variables (Will need to check back with frontend for what is sent in):
- 
*/
router.get("/officers", function(req, res) {
  //Filter through database for the officer based on given req data
  //Package the returned officers info into a variable that client can use, send it back to them.
  res.send("placeholder content");
});

/*
Purpose: Remove the specified officer from the database

Needed Info:
-

Assumed req variables (Will need to check back with frontend for what is sent in):
- 
*/
router.delete("/officers", function(req, res) {
  //Filter through database for the officer based on given req data
  //Remove the existing officer doc if exists.
  res.send("placeholder content");
});

//-------------------------------Endpoints for committee related information--------------------------------

/*
Purpose: Save a new or update an existing officer in the DB, 

Needed Info:
- Can non officers join a committee? 
- If a list of members are provided, will it be based on officer ids or user ids?

Assumed req variables (Will need to check with frontend for what is sent in):
- 
*/
router.post("/committees", function(req, res) {
  //Find preexisting committee doc from DB. 
  //If committee exists, update the field related, 
  //Else make a new committee doc and post the info to DB. 
  /*Assumptions:
    If all officers (ideal):
    - An array of json objects with an officer id and a committee picture in each object will be in the req.
    - If committee exists, then check if the officer's id preexists in the members list, 
    - Else then add them to the list with their picture if they sent one in.

    If non officers can be in committee:
    - An array of json objects with a user id and a committee picture in each object will be in the req.
    - Check if user is an officer yet, if not then call the officer endpoint to save them as an officer based on given user id info.
    - Once user is an officer, save user id into the member list
  */
 
  //Also set cmeHasMember field to false when making new committee, as there are no members.
res.send("placeholder content");
});

/*
Purpose: Retrieve a committee from the DB

Needed Info:
-

Assumed req variables (Will need to check back with frontend for what is sent in):
- 
*/
router.get("/committees", function(req, res) {
  //Filter through database for the committee based on given req data
  //Package the returned committee info into a variable that client can use, send it back to them.
  res.send("placeholder content");
});

/*
Purpose: Remove the specified committee from the database

Needed Info:
-

Assumed req variables (Will need to check back with frontend for what is sent in):
- 
*/
router.delete("/committees", function(req, res) {
  //Filter through database for the committee based on given req data
  //Remove the committee if found
  //When deleting, check if cmeMembers is 0, if so then cmeHasMember is set to false, otherwise true.
res.send("placeholder content");
});

export default router