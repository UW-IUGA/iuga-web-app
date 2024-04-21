import express from 'express';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import sessions from 'express-session';
import cors from 'cors';
import path from 'path';

import { models, connectToDatabase } from './models.js'
import apiv1Router from './routes/api/v1/apiv1.js';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

await connectToDatabase();
const app = express();

if (!process.env.DEPLOY) {
    app.use(cors());
}

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
    req.models = models;
    next();
})

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

app.get('/events', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

app.get('/resources', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

app.get('/about', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

app.get('/contact', function(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/build/index.html'), function(err) {
      if (err) {
        res.status(500).send(err)
      }
    })
})

app.use('/api/v1', apiv1Router);

export default app;
