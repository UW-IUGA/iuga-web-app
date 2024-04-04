/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in users.js:
- Users
*/

import express from 'express';


var router = express.Router();

/*Start Writing Endpoints*/

router.get("/", function(req, res) {
    res.send("users");
});

export default router