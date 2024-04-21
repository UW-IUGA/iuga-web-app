import express from 'express';
var router = express.Router();

import usersRouter from './controllers/user.js';
import eventsRouter from './controllers/events.js';

router.use('/user', usersRouter);
router.use('/events', eventsRouter);

export default router;