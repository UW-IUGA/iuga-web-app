import express from 'express';
var router = express.Router();

import usersRouter from './controllers/users.js';
import eventsRouter from './controllers/events.js';

router.use('/users', usersRouter);
router.use('/events', eventsRouter);

export default router;