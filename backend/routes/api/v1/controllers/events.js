/*
Refer to the "IUGA Website Backend Doc" for more information.

Schemas addressed in events.js:
- Calendars
- Events
- Participants
*/

import express from 'express';

var router = express.Router();

router.get("/", function(req, res) {
    res.send("events");
});

export default router;