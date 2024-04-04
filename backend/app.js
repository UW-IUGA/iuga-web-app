import express from 'express';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import cors from 'cors';
import sessions from 'express-session';


import { models, connectToDatabase } from './models.js'
import apiv1Router from './routes/api/v1/apiv1.js';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// multer middleware used for handling the image uploads on posts
// all images are added to the /uploads directory with randomized filenames
var storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, './routes/api/v1/uploads')
    },
    filename: (req, file, cb) => {
      cb(null, file.fieldname + '-' + Date.now())
    }
  });

var upload = multer({ storage: storage }); //We can use this upload variable to store/retrieve images.

await connectToDatabase();
var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Make sure that the client gets the latest version of resource
app.disable('etag');

app.use(express.static("../frontend/build"));

app.use(sessions({
    secret: "CDF45B4E15F646CF38464A9E747D1",
    saveUninitialized: true,
    resave: false,
}))

app.use((req, res, next) => {
    req.upload = upload
    next();
});
app.use((req, res, next) => {
    req.models = models;
    next();
})


app.use('/api/v1', apiv1Router);

export default app;
